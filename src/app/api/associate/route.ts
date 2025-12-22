import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const recordId = typeof body.recordId === "string" ? body.recordId.trim() : "";
  const siteId = typeof body.siteId === "string" ? body.siteId : null;

  if (!recordId) {
    return NextResponse.json({ error: "recordId required" }, { status: 400 });
  }

  if (!siteId) {
    await prisma.association.deleteMany({ where: { recordId } });
    return NextResponse.json({ ok: true });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return NextResponse.json({ error: "siteId unknown" }, { status: 400 });
  }

  await prisma.association.upsert({
    where: { recordId },
    update: { siteId },
    create: { recordId, siteId },
  });

  return NextResponse.json({ ok: true });
}
