import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed is disabled in production.");
  }

  const email = process.env.SEED_OWNER_EMAIL;
  if (!email) {
    console.log("No SEED_OWNER_EMAIL set; nothing to seed.");
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) {
    console.log("Seed owner does not exist; nothing to seed.");
    return;
  }

  const workspace = await prisma.workspace.upsert({
    where: { id: process.env.SEED_WORKSPACE_ID ?? "dev-workspace" },
    update: {},
    create: {
      id: process.env.SEED_WORKSPACE_ID ?? "dev-workspace",
      name: "MERIT Development",
    },
  });

  await prisma.member.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    update: { role: Role.OWNER, email: user.email },
    create: { workspaceId: workspace.id, userId: user.id, email: user.email, role: Role.OWNER },
  });

  console.log("Seeded owner into MERIT Development.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());