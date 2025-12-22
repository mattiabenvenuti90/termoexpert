import { prisma } from "@/lib/prisma";

export async function can(userId: string, organizationId: string, permissionKey: string) {
  const profile = await prisma.userProfile.findUnique({
    where: { id: userId },
    select: { isPlatformSuperAdmin: true },
  });
  if (profile?.isPlatformSuperAdmin) return true;

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId, organizationId, status: "active" },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
      permissionOverrides: {
        include: { permission: true },
      },
    },
  });

  if (!membership) return false;

  const allowed = new Set(
    membership.role.permissions.map((rp) => rp.permission.key)
  );

  for (const override of membership.permissionOverrides) {
    if (override.mode === "grant") allowed.add(override.permission.key);
    if (override.mode === "revoke") allowed.delete(override.permission.key);
  }

  return allowed.has(permissionKey);
}
