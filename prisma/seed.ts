import { defaultNickname } from "@/features/users/nickname";
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

  const users = await db.user.findMany({ select: { nickname: true } });
  const taken = new Set(users.map(({ nickname }) => nickname.toLowerCase()));

  await db.user.create({
    data: {
      login: ADMIN_LOGIN,
      fullName: ADMIN_FULL_NAME,
      nickname: defaultNickname(ADMIN_FULL_NAME, ADMIN_LOGIN, (nickname) =>
        taken.has(nickname.toLowerCase()),
      ),
      role: Role.ADMIN,
      passwordHash: await hashPassword(password),
    },
  });
  console.log(`Created user "${ADMIN_LOGIN}".`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
