import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireOrganization } from "@/lib/organization";
import {
  getFluidaSyncStatus,
  listFluidaSyncLogs,
  runFluidaSync,
} from "@/modules/fluida-sync/server/sync";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const org = await requireOrganization(request, auth.userId);
  if (!org.ok) return org.response;

  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 20;

  const [status, logs] = await Promise.all([
    getFluidaSyncStatus(org.organizationId),
    listFluidaSyncLogs(org.organizationId, limit),
  ]);

  return NextResponse.json({ status, logs });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const org = await requireOrganization(request, auth.userId);
  if (!org.ok) return org.response;

  let body: { windowDays?: number } = {};
  try {
    body = (await request.json()) as { windowDays?: number };
  } catch {
    body = {};
  }

  try {
    const result = await runFluidaSync({
      organizationId: org.organizationId,
      triggeredBy: auth.userId,
      windowDays: body.windowDays,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
