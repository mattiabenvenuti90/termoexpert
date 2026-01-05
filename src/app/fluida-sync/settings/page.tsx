import { SyncSettings } from "@/modules/fluida-sync";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function FluidaSyncSettingsPage({ searchParams }: PageProps) {
  const organizationIdRaw = searchParams?.organizationId;
  const organizationId = Array.isArray(organizationIdRaw)
    ? organizationIdRaw[0]
    : organizationIdRaw;

  return <SyncSettings organizationId={organizationId} />;
}
