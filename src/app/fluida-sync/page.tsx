import { SyncDashboard } from "@/modules/fluida-sync";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function FluidaSyncPage({ searchParams }: PageProps) {
  const organizationIdRaw = searchParams?.organizationId;
  const organizationId = Array.isArray(organizationIdRaw)
    ? organizationIdRaw[0]
    : organizationIdRaw;

  return <SyncDashboard organizationId={organizationId} />;
}
