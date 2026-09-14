import { Role } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";

const ADMIN_LOGIN = "admin";
const ADMIN_FULL_NAME = "Администратор системы";

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password?.trim()) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is not set. Add it to .env (see .env.example) and run `npm run db:seed` again.",
    );
  }

  const existing = await db.user.findUnique({
    where: { login: ADMIN_LOGIN },
    select: { id: true },
  });
  if (existing) {
    console.log(`User "${ADMIN_LOGIN}" already exists, skipping.`);
    return;
  }

  await db.user.create({
    data: {
      login: ADMIN_LOGIN,
      fullName: ADMIN_FULL_NAME,
      role: Role.ADMIN,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  console.log(`Created user "${ADMIN_LOGIN}". The password must be changed on first login.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
