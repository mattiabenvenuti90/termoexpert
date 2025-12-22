const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const permissions = [
  { key: "users.read", group: "users", description: "Leggere utenti" },
  { key: "users.invite", group: "users", description: "Invitare utenti" },
  { key: "users.remove", group: "users", description: "Rimuovere utenti" },
  { key: "users.update_role", group: "users", description: "Cambiare ruolo utenti" },
  { key: "roles.read", group: "roles", description: "Leggere ruoli" },
  { key: "roles.create_custom", group: "roles", description: "Creare ruoli custom" },
  { key: "roles.update_custom", group: "roles", description: "Aggiornare ruoli custom" },
  { key: "roles.delete_custom", group: "roles", description: "Eliminare ruoli custom" },
  { key: "deals.read_own", group: "deals", description: "Leggere i propri deal" },
  { key: "deals.read_team", group: "deals", description: "Leggere deal del team" },
  { key: "deals.read_all", group: "deals", description: "Leggere tutti i deal" },
  { key: "deals.create", group: "deals", description: "Creare deal" },
  { key: "deals.update_own", group: "deals", description: "Aggiornare propri deal" },
  { key: "deals.update_all", group: "deals", description: "Aggiornare tutti i deal" },
  { key: "jobs.read_assigned", group: "jobs", description: "Leggere job assegnati" },
  { key: "jobs.read_team", group: "jobs", description: "Leggere job del team" },
  { key: "jobs.read_all", group: "jobs", description: "Leggere tutti i job" },
  { key: "jobs.update_assigned", group: "jobs", description: "Aggiornare job assegnati" },
  { key: "billing.read", group: "billing", description: "Leggere billing" },
  { key: "billing.manage_organization", group: "billing", description: "Gestire billing" },
  { key: "organization.update_settings", group: "organization", description: "Aggiornare impostazioni org" },
  { key: "modules.manage_activation", group: "organization", description: "Gestire moduli" },
];

const rolePermissions = {
  PLATFORM_SUPER_ADMIN: permissions.map((p) => p.key),
  ORG_OWNER: permissions.map((p) => p.key),
  ORG_ADMIN: permissions.map((p) => p.key).filter((k) => k !== "billing.manage_organization"),
  ORG_MANAGER: ["deals.read_team", "deals.update_own", "jobs.read_team", "jobs.update_assigned", "users.read"],
  ORG_MEMBER: ["deals.read_own", "deals.update_own", "jobs.read_assigned", "jobs.update_assigned"],
  ORG_EXTERNAL_TECH: ["jobs.read_assigned", "jobs.update_assigned"],
  ORG_READ_ONLY: ["deals.read_team", "jobs.read_team", "users.read"],
};

async function main() {
  const adminUserId = process.env.SUPER_ADMIN_USER_ID;
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  const orgName = process.env.INITIAL_ORG_NAME || "Fluida Tenant";

  if (!adminUserId) {
    throw new Error("Missing SUPER_ADMIN_USER_ID. Create the user in Supabase Auth and set its UUID here.");
  }

  await prisma.userProfile.upsert({
    where: { id: adminUserId },
    update: { email: adminEmail ?? undefined, isPlatformSuperAdmin: true },
    create: { id: adminUserId, email: adminEmail || "superadmin@example.com", isPlatformSuperAdmin: true },
  });

  const org = await prisma.organization.create({
    data: { name: orgName },
  });

  const perms = await Promise.all(
    permissions.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        update: { group: p.group, description: p.description },
        create: p,
      })
    )
  );

  const roles = await Promise.all(
    Object.keys(rolePermissions).map((key) =>
      prisma.role.create({
        data: {
          organizationId: key === "PLATFORM_SUPER_ADMIN" ? null : org.id,
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
  if (!ownerRole) throw new Error("Owner role missing");

  const adminUser = await prisma.userProfile.findUnique({
    where: { id: adminUserId },
  });
  if (!adminUser) throw new Error("Admin profile not found");

  await prisma.organizationMembership.upsert({
    where: {
      userId_organizationId: {
        userId: adminUser.id,
        organizationId: org.id,
      },
    },
    update: { roleId: ownerRole.id, status: "active" },
    create: {
      userId: adminUser.id,
      organizationId: org.id,
      roleId: ownerRole.id,
      status: "active",
    },
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
