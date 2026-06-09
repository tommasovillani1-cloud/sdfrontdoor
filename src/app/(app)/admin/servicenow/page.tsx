import { getServiceNowConfigPublic } from "@/lib/servicenow/config";
import { ServiceNowForm } from "@/components/admin/ServiceNowForm";

export const dynamic = "force-dynamic";

export default async function ServiceNowPage() {
  const config = await getServiceNowConfigPublic();

  return (
    <div className="max-w-2xl">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-ink">ServiceNow connection</h2>
        <p className="text-xs text-ink-muted">
          Configure the ServiceNow integration. It is disabled by default and
          stays off until you enable it with valid credentials. Secrets are
          encrypted at rest and never logged. At launch, escalation uses the
          email handoff; this integration is scaffolded for later.
        </p>
      </div>
      <ServiceNowForm initial={config} />
    </div>
  );
}
