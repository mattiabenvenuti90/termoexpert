import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { permissions, rolePermissions } from "@/lib/rbacSeed";

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const userId = auth.userId;

  const existingSuperAdmin = await prisma.userProfile.findFirst({
    where: { isPlatformSuperAdmin: true },
  });

  let email = "user@example.com";
  try {
    const body = await request.json();
    if (body && typeof body.email === "string") email = body.email;
  } catch {
    // ignore invalid body
  }

  const profile = await prisma.userProfile.upsert({
    where: { id: userId },
    update: {
      email,
      isPlatformSuperAdmin: existingSuperAdmin ? false : true,
    },
    create: {
      id: userId,
      email,
      isPlatformSuperAdmin: existingSuperAdmin ? false : true,
    },
  });

  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "Default Organization" },
    });
  }

  const perms = await Promise.all(
    permissions.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        update: { group: p.group, description: p.description },
        create: p,
      })
    )
  );

  const roleKeys = Object.keys(rolePermissions);
  const roles = await Promise.all(
    roleKeys.map((key) =>
      prisma.role.upsert({
        where: { organizationId_slug: { organizationId: key === "PLATFORM_SUPER_ADMIN" ? null : org!.id, slug: key.toLowerCase() } },
        update: { name: key, isSystem: true, systemKey: key, isEditable: false },
        create: {
          organizationId: key === "PLATFORM_SUPER_ADMIN" ? null : org!.id,
          name: key,
          slug: key.toLowerCase(),
          isSystem: true,
          systemKey: key,
          isEditable: false,
          isDefaultForNewMembers: key === "ORG_MEMBER",
        },
      })
    )
  );

  for (const role of roles) {
    const permKeys = rolePermissions[role.systemKey];
    if (!permKeys) continue;
    const ids = perms.filter((p) => permKeys.includes(p.key)).map((p) => p.id);
    await prisma.rolePermission.createMany({
      data: ids.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  const ownerRole = roles.find((r) => r.systemKey === "ORG_OWNER");
  if (ownerRole) {
    await prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: { userId: profile.id, organizationId: org.id },
      },
      update: { roleId: ownerRole.id, status: "active" },
      create: {
        userId: profile.id,
        organizationId: org.id,
        roleId: ownerRole.id,
        status: "active",
      },
    });
  }

  return NextResponse.json({ ok: true, organizationId: org.id });
}
