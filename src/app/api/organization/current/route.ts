import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const profile = await prisma.userProfile.findUnique({
    where: { id: auth.userId },
    select: { isPlatformSuperAdmin: true },
  });

  if (profile?.isPlatformSuperAdmin) {
    const org = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!org) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }
    return NextResponse.json({ organizationId: org.id });
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId: auth.userId, status: "active" },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "No active organization" }, { status: 404 });
  }

  return NextResponse.json({ organizationId: membership.organizationId });
}
