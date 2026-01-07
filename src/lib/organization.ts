import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type OrgResult =
  | { ok: true; organizationId: string }
  | { ok: false; response: NextResponse };

export async function requireOrganization(
  request: NextRequest,
  userId: string
): Promise<OrgResult> {
  if (process.env.AUTH_DISABLED === "1") {
    const org =
      (request.nextUrl.searchParams.get("organizationId") ||
        request.headers.get("x-organization-id")) ??
      null;
    if (org) {
      return { ok: true, organizationId: org };
    }
    const first = await prisma.organization.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!first) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "No organization found" },
          { status: 404 }
        ),
      };
    }
    return { ok: true, organizationId: first.id };
  }
  const organizationId =
    request.nextUrl.searchParams.get("organizationId") ||
    request.headers.get("x-organization-id");

  if (!organizationId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "organizationId required" },
        { status: 400 }
      ),
    };
  }

  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { isPlatformSuperAdmin: true },
  });
  if (profile?.isPlatformSuperAdmin) {
    return { ok: true, organizationId };
  }

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId, organizationId, status: "active" },
    select: { id: true },
  });

  if (!membership) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, organizationId };
}
