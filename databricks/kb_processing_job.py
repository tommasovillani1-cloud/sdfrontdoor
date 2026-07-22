# Databricks notebook source
# MAGIC %md
# MAGIC # KB SharePoint Sync Job
# MAGIC
# MAGIC Incrementally syncs the knowledge base from a **SharePoint folder** into the
# MAGIC `kb_chunks` Delta table. The knowledge source is a single SharePoint folder
# MAGIC selected by an admin in the app; this job owns ALL of the incremental logic:
# MAGIC
# MAGIC 1. Authenticates app-only as the SharePoint Entra app (client credentials;
# MAGIC    the same registration the app uses for delegated browse, via its
# MAGIC    application Sites.Read.All), reading `SHAREPOINT_*` from this job's
# MAGIC    Databricks secret scope. The app never sends any secret in job parameters.
# MAGIC 2. Enumerates the folder via a Microsoft Graph **delta** query, persisting the
# MAGIC    returned `@odata.deltaLink` as a cursor in a Databricks Delta state table.
# MAGIC    Subsequent runs call the saved deltaLink and receive only changes
# MAGIC    (new / updated items, plus items carrying a `deleted` facet).
# MAGIC 3. For new/updated files: downloads bytes from Graph, extracts text (with a
# MAGIC    Claude OCR fallback for scanned PDFs), chunks, and upserts rows keyed by the
# MAGIC    drive **item id** (delete-then-insert that item's rows).
# MAGIC 4. For deleted items: removes their rows from `kb_chunks` (this is how removed
# MAGIC    files are dropped from the index).
# MAGIC
# MAGIC Triggered by the app via `POST /api/2.1/jobs/run-now` with job parameters. No
# MAGIC Postgres status writes happen here (the old `kb_documents` registry is gone).
# MAGIC After a successful write, the app (or the cadence cron) triggers the Vector
# MAGIC Search Delta Sync Index sync separately.

# COMMAND ----------

# MAGIC %pip install pymupdf python-docx openai requests --quiet
# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------

import os
import io
import json
import base64
import datetime as dt

import requests

# Job parameters (sent by the app's triggerSharePointSyncJob). No secrets here.
dbutils.widgets.text("source_type", "sharepoint")
dbutils.widgets.text("site_id", "")
dbutils.widgets.text("drive_id", "")
dbutils.widgets.text("folder_id", "")
dbutils.widgets.text("folder_path", "")
dbutils.widgets.text("include_subfolders", "true")
dbutils.widgets.text("delta_table", "e6_knowledgebase_dev.default.kb_chunks")
dbutils.widgets.text("vector_index", "")

source_type = dbutils.widgets.get("source_type")
site_id = dbutils.widgets.get("site_id")
drive_id = dbutils.widgets.get("drive_id")
folder_id = dbutils.widgets.get("folder_id")
folder_path = dbutils.widgets.get("folder_path")
include_subfolders = dbutils.widgets.get("include_subfolders").strip().lower() == "true"
delta_table = dbutils.widgets.get("delta_table")

assert source_type == "sharepoint", f"Unsupported source_type: {source_type}"
assert drive_id and folder_id and delta_table, "Missing required job parameters"

# The sync-state table lives alongside kb_chunks (same catalog.schema).
_parts = delta_table.split(".")
state_table = ".".join(_parts[:-1] + ["kb_sync_state"]) if len(_parts) >= 2 else "kb_sync_state"

print(
    f"SharePoint sync drive={drive_id} folder={folder_id} "
    f"include_subfolders={include_subfolders} -> {delta_table}"
)

# COMMAND ----------

# App-only Graph auth as the SharePoint Entra app (the same registration the app
# uses for delegated browse; here we use its APPLICATION Sites.Read.All via client
# credentials). Credentials come from the job's Databricks secret scope, NEVER from
# job parameters (which persist in run history). Distinct from the enrichment app.
SYNC_SCOPE = "e6-sdfrontdoor-dev"

SYNC_TENANT_ID = dbutils.secrets.get(scope=SYNC_SCOPE, key="SHAREPOINT_TENANT_ID")
SYNC_CLIENT_ID = dbutils.secrets.get(scope=SYNC_SCOPE, key="SHAREPOINT_CLIENT_ID")
SYNC_CLIENT_SECRET = dbutils.secrets.get(scope=SYNC_SCOPE, key="SHAREPOINT_CLIENT_SECRET")

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def get_graph_token() -> str:
    """Acquire an app-only Graph token via client_credentials (.default)."""
    url = f"https://login.microsoftonline.com/{SYNC_TENANT_ID}/oauth2/v2.0/token"
    resp = requests.post(
        url,
        data={
            "client_id": SYNC_CLIENT_ID,
            "client_secret": SYNC_CLIENT_SECRET,
            "grant_type": "client_credentials",
            "scope": "https://graph.microsoft.com/.default",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


GRAPH_TOKEN = get_graph_token()
GRAPH_HEADERS = {"Authorization": f"Bearer {GRAPH_TOKEN}"}

# COMMAND ----------

# Delta cursor state, stored in Databricks (NOT Postgres). One row per
# drive_id + folder_id, holding the last @odata.deltaLink and the last run time.
spark.sql(
    f"""
    CREATE TABLE IF NOT EXISTS {state_table} (
        drive_id STRING,
        folder_id STRING,
        delta_link STRING,
        last_run TIMESTAMP
    ) USING DELTA
    """
)


def load_delta_link() -> str | None:
    rows = spark.sql(
        f"SELECT delta_link FROM {state_table} "
        f"WHERE drive_id = '{drive_id}' AND folder_id = '{folder_id}'"
    ).collect()
    return rows[0]["delta_link"] if rows and rows[0]["delta_link"] else None


def save_delta_link(link: str):
    now = dt.datetime.utcnow()
    # Delete-then-insert keeps a single current cursor row for this folder.
    spark.sql(
        f"DELETE FROM {state_table} "
        f"WHERE drive_id = '{drive_id}' AND folder_id = '{folder_id}'"
    )
    df = spark.createDataFrame(
        [(drive_id, folder_id, link, now)],
        schema="drive_id STRING, folder_id STRING, delta_link STRING, last_run TIMESTAMP",
    )
    df.write.mode("append").saveAsTable(state_table)


# COMMAND ----------

def graph_delta_items() -> list[dict]:
    """Enumerate folder changes via Graph delta.

    On the first run (no saved cursor) we start a fresh delta on the folder,
    which returns the full current contents. On later runs we follow the saved
    deltaLink and receive only changes since. Either way we follow @odata.nextLink
    to the end and persist the final @odata.deltaLink as the new cursor.
    """
    saved = load_delta_link()
    if saved:
        url = saved
    else:
        url = f"{GRAPH_BASE}/drives/{drive_id}/items/{folder_id}/delta"

    items: list[dict] = []
    delta_link: str | None = None
    while url:
        resp = requests.get(url, headers=GRAPH_HEADERS, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        items.extend(data.get("value", []))
        if "@odata.nextLink" in data:
            url = data["@odata.nextLink"]
        else:
            delta_link = data.get("@odata.deltaLink")
            url = None

    if delta_link:
        save_delta_link(delta_link)

    return items


# COMMAND ----------

def is_in_scope(item: dict) -> bool:
    """Whether a delta item belongs to the selected source.

    The folder delta root itself appears in the feed and is skipped. When
    subfolders are excluded, only direct children of the selected folder are kept
    (parentReference.id == folder_id). When included, the natural recursive delta
    under the folder is kept as-is.
    """
    if item.get("id") == folder_id:
        return False
    if include_subfolders:
        return True
    parent = item.get("parentReference") or {}
    return parent.get("id") == folder_id


def download_item_bytes(item_id: str) -> bytes:
    url = f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}/content"
    resp = requests.get(url, headers=GRAPH_HEADERS, timeout=120)
    resp.raise_for_status()
    return resp.content


# COMMAND ----------

# Embedding/Chat client for OCR fallback (Databricks serving, OpenAI-compatible).
from openai import OpenAI

WORKSPACE_URL = (
    spark.conf.get("spark.databricks.workspaceUrl", None)
    or os.environ.get("DATABRICKS_HOST", "")
)
if WORKSPACE_URL and not WORKSPACE_URL.startswith("http"):
    WORKSPACE_URL = f"https://{WORKSPACE_URL}"

DATABRICKS_TOKEN = (
    dbutils.notebook.entry_point.getDbutils().notebook().getContext()
    .apiToken().get()
)

OCR_MODEL = "databricks-claude-sonnet-4-6"

ai_client = OpenAI(
    api_key=DATABRICKS_TOKEN,
    base_url=f"{WORKSPACE_URL}/serving-endpoints",
)


def ocr_image_png(png_bytes: bytes) -> str:
    """Claude OCR for a single rendered page image. Returns extracted text."""
    b64 = base64.b64encode(png_bytes).decode("ascii")
    resp = ai_client.chat.completions.create(
        model=OCR_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract all readable text from this scanned document "
                            "page. Return only the text, preserving paragraph "
                            "breaks. If the page has no text, return an empty string."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}"},
                    },
                ],
            }
        ],
        max_tokens=4000,
        temperature=0,
    )
    return resp.choices[0].message.content or ""


# COMMAND ----------

def extract_text(data: bytes, filename: str) -> str:
    """Extract text by file type from raw bytes. PDFs use embedded text, falling
    back to Claude OCR for pages with little/no extractable text (scanned PDFs)."""
    lower = filename.lower()

    if lower.endswith(".pdf"):
        import fitz  # pymupdf

        doc = fitz.open(stream=data, filetype="pdf")
        parts = []
        for page in doc:
            text = page.get_text("text").strip()
            if len(text) < 20:  # likely scanned: render and OCR
                pix = page.get_pixmap(dpi=200)
                png = pix.tobytes("png")
                try:
                    text = ocr_image_png(png).strip()
                except Exception as e:  # noqa: BLE001
                    print(f"WARN: OCR failed on a page: {e}")
                    text = text or ""
            if text:
                parts.append(text)
        return "\n\n".join(parts)

    if lower.endswith(".docx"):
        import docx

        d = docx.Document(io.BytesIO(data))
        return "\n\n".join(p.text for p in d.paragraphs if p.text.strip())

    if lower.endswith((".txt", ".md", ".csv", ".json", ".html", ".htm")):
        return data.decode("utf-8", errors="replace")

    # Unknown type: best-effort decode.
    return data.decode("utf-8", errors="replace")


# COMMAND ----------

def chunk_text(text: str, target_chars: int = 1500, overlap: int = 200) -> list[str]:
    """Simple paragraph-aware character chunker with overlap."""
    text = text.strip()
    if not text:
        return []
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, cur = [], ""
    for p in paras:
        if len(cur) + len(p) + 2 <= target_chars:
            cur = f"{cur}\n\n{p}" if cur else p
        else:
            if cur:
                chunks.append(cur)
            if len(p) > target_chars:
                # Hard-split very long paragraphs.
                start = 0
                while start < len(p):
                    chunks.append(p[start : start + target_chars])
                    start += target_chars - overlap
                cur = ""
            else:
                cur = p
    if cur:
        chunks.append(cur)
    return chunks


# COMMAND ----------

# Preserve original filenames verbatim (mirror of src/lib/kb/paths.ts
# sanitiseSegment): only sanitise characters illegal in a path component, keep the
# human-readable name intact. No collision suffixing is needed here because the
# drive item id is the stable key for kb_chunks (filename is display metadata).
import re

_ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')


def sanitise_segment(name: str) -> str:
    cleaned = _ILLEGAL.sub("_", name)
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\.+$", "", cleaned).strip()
    return cleaned or "untitled"


def item_folder_path(item: dict) -> str:
    """Human-readable folder path for an item, relative to the source root."""
    parent = item.get("parentReference") or {}
    parent_path = parent.get("path") or ""
    # parentReference.path looks like "/drives/{id}/root:/A/B"; take the part
    # after "root:". Fall back to the configured folder_path.
    marker = "root:"
    if marker in parent_path:
        rel = parent_path.split(marker, 1)[1].lstrip("/")
        return rel or folder_path
    return folder_path


# COMMAND ----------

# Main: delta enumerate -> upsert new/updated, delete removed -> in kb_chunks.
from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    IntegerType,
    BooleanType,
    TimestampType,
)

# Explicit schema: several columns can be entirely null (category, uploaded_by),
# which would otherwise make Spark's type inference fail. document_id holds the
# SharePoint drive item id.
CHUNK_SCHEMA = StructType(
    [
        StructField("chunk_id", StringType(), False),
        StructField("document_id", StringType(), True),
        StructField("filename", StringType(), True),
        StructField("folder_path", StringType(), True),
        StructField("category", StringType(), True),
        StructField("version", IntegerType(), True),
        StructField("is_active", BooleanType(), True),
        StructField("chunk_index", IntegerType(), True),
        StructField("content", StringType(), True),
        StructField("uploaded_by", StringType(), True),
        StructField("uploaded_at", TimestampType(), True),
    ]
)


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def delete_item_rows(item_id: str):
    spark.sql(
        f"DELETE FROM {delta_table} WHERE document_id = '{sql_escape(item_id)}'"
    )


def upsert_item(item: dict):
    """Download, extract, chunk, and replace this item's rows in kb_chunks."""
    item_id = item["id"]
    filename = sanitise_segment(item.get("name") or item_id)

    data = download_item_bytes(item_id)
    text = extract_text(data, filename)
    chunks = chunk_text(text)
    print(f"  {filename}: {len(text)} chars -> {len(chunks)} chunks")

    now = dt.datetime.utcnow()
    rel_folder = item_folder_path(item)
    rows = [
        (
            f"{item_id}:{i}",
            item_id,
            filename,
            rel_folder,
            None,
            1,
            True,
            i,
            c,
            None,
            now,
        )
        for i, c in enumerate(chunks)
    ]

    # Idempotent: delete any existing rows for this item, then insert.
    delete_item_rows(item_id)
    if rows:
        df = spark.createDataFrame(rows, schema=CHUNK_SCHEMA)
        df.write.mode("append").saveAsTable(delta_table)


# COMMAND ----------

items = graph_delta_items()
print(f"Delta returned {len(items)} raw items")

processed = 0
deleted = 0
skipped = 0

for item in items:
    if not is_in_scope(item):
        skipped += 1
        continue

    if "deleted" in item:
        # Removed from SharePoint (or moved out of scope): drop from the index.
        delete_item_rows(item["id"])
        deleted += 1
        continue

    # Folders themselves carry a "folder" facet and have no content to extract.
    if "folder" in item:
        skipped += 1
        continue

    try:
        upsert_item(item)
        processed += 1
    except Exception as e:  # noqa: BLE001
        print(f"WARN: failed to process item {item.get('name')} ({item.get('id')}): {e}")

summary = {
    "ok": True,
    "drive_id": drive_id,
    "folder_id": folder_id,
    "include_subfolders": include_subfolders,
    "processed": processed,
    "deleted": deleted,
    "skipped": skipped,
    "raw_items": len(items),
}
print(f"Done. {summary}")
dbutils.notebook.exit(json.dumps(summary))
