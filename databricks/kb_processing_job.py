# Databricks notebook source
# MAGIC %md
# MAGIC # KB Processing Job
# MAGIC
# MAGIC Parses an uploaded knowledge base document from the Unity Catalog Volume,
# MAGIC extracts text (with a Claude OCR fallback for scanned PDFs), chunks it, and
# MAGIC writes rows to the `kb_chunks` Delta table. Updates the document status in
# MAGIC the application's Postgres registry (`pending` -> `processed` / `error`).
# MAGIC
# MAGIC Triggered by the app via `POST /api/2.1/jobs/run-now` with job parameters.
# MAGIC After a successful write, the app (or the cadence cron) triggers the Vector
# MAGIC Search Delta Sync Index sync separately.

# COMMAND ----------

# MAGIC %pip install pymupdf psycopg2-binary python-docx openai --quiet
# COMMAND ----------
dbutils.library.restartPython()

# COMMAND ----------

import os
import io
import json
import base64
import datetime as dt

# Job parameters (sent by the app's triggerProcessingJob).
dbutils.widgets.text("document_id", "")
dbutils.widgets.text("volume_path", "")
dbutils.widgets.text("original_filename", "")
dbutils.widgets.text("folder_path", "")
dbutils.widgets.text("category", "")
dbutils.widgets.text("delta_table", "e6_knowledgebase_dev.default.kb_chunks")

document_id = dbutils.widgets.get("document_id")
volume_path = dbutils.widgets.get("volume_path")
original_filename = dbutils.widgets.get("original_filename")
folder_path = dbutils.widgets.get("folder_path")
category = dbutils.widgets.get("category") or None
delta_table = dbutils.widgets.get("delta_table")

assert document_id and volume_path and delta_table, "Missing required job parameters"

print(f"Processing document_id={document_id} file={original_filename} -> {delta_table}")

# COMMAND ----------

# Connection to the app's Postgres registry, to report status back.
import psycopg2

DATABASE_URL = dbutils.secrets.get(scope="e6_kb", key="database_url")


def set_document_status(status: str, error_message: str | None = None):
    """Best-effort status update in the kb_documents registry."""
    try:
        conn = psycopg2.connect(DATABASE_URL)
        with conn, conn.cursor() as cur:
            cur.execute(
                'UPDATE kb_documents SET status = %s, error_message = %s WHERE id = %s',
                (status, error_message, document_id),
            )
        conn.close()
        print(f"status -> {status}" + (f" ({error_message})" if error_message else ""))
    except Exception as e:  # noqa: BLE001
        print(f"WARN: could not update status: {e}")


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

# COMMAND ----------

def read_volume_bytes(path: str) -> bytes:
    # Volume paths are readable directly via the /Volumes FUSE mount.
    with open(path, "rb") as f:
        return f.read()


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

def extract_text(path: str, filename: str) -> str:
    """Extract text by file type. PDFs use embedded text, falling back to Claude
    OCR for pages with little/no extractable text (scanned PDFs)."""
    lower = filename.lower()

    if lower.endswith(".pdf"):
        import fitz  # pymupdf

        data = read_volume_bytes(path)
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

        data = read_volume_bytes(path)
        d = docx.Document(io.BytesIO(data))
        return "\n\n".join(p.text for p in d.paragraphs if p.text.strip())

    if lower.endswith((".txt", ".md", ".csv", ".json", ".html", ".htm")):
        return read_volume_bytes(path).decode("utf-8", errors="replace")

    # Unknown type: best-effort decode.
    return read_volume_bytes(path).decode("utf-8", errors="replace")


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

# Main: extract -> chunk -> replace this document's rows in kb_chunks.
from pyspark.sql.types import (
    StructType,
    StructField,
    StringType,
    IntegerType,
    BooleanType,
    TimestampType,
)

# Explicit schema: several columns can be entirely null (category, uploaded_by),
# which would otherwise make Spark's type inference fail.
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

try:
    set_document_status("pending")

    text = extract_text(volume_path, original_filename)
    chunks = chunk_text(text)
    print(f"Extracted {len(text)} chars -> {len(chunks)} chunks")

    now = dt.datetime.utcnow()
    rows = [
        (
            f"{document_id}:{i}",
            document_id,
            original_filename,
            folder_path,
            category,
            1,
            True,
            i,
            c,
            None,
            now,
        )
        for i, c in enumerate(chunks)
    ]

    # Idempotent: delete any existing rows for this document, then insert.
    spark.sql(
        f"DELETE FROM {delta_table} WHERE document_id = '{document_id}'"
    )

    if rows:
        df = spark.createDataFrame(rows, schema=CHUNK_SCHEMA)
        df.write.mode("append").saveAsTable(delta_table)

    set_document_status("processed")
    print("Done.")

    dbutils.notebook.exit(
        json.dumps({"ok": True, "chunks": len(chunks), "document_id": document_id})
    )

except Exception as e:  # noqa: BLE001
    set_document_status("error", str(e)[:500])
    raise
