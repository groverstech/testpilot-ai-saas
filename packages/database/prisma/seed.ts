/**
 * Development seed. Creates ONE demo user + organization so a developer can log in quickly.
 * It intentionally creates NO projects, test runs, bugs or other fabricated QA data.
 *
 *   pnpm db:seed   →  demo@testpilot.local / ChangeMe123!
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@testpilot/shared/password";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const email = "demo@testpilot.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Seed user ${email} already exists — nothing to do.`);
    return;
  }
  const passwordHash = await hashPassword("ChangeMe123!");
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name: "Demo User", passwordHash, emailVerifiedAt: new Date() },
    });
    const org = await tx.organization.create({ data: { name: "Demo Organization", slug: "demo-organization" } });
    await tx.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    await tx.workspace.create({ data: { organizationId: org.id, name: "General", slug: "general", isDefault: true } });
    await tx.subscription.create({ data: { organizationId: org.id, plan: "FREE", status: "ACTIVE" } });
  });
  console.log(`Seeded ${email} / ChangeMe123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
