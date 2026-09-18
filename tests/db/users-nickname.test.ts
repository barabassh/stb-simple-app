import { describe, expect, it } from "vitest";

import { createUser as createUserAction } from "@/features/users/actions";
import { db } from "@/lib/db";

import { actAs, createUser } from "./helpers";

// The default nickname of a new user (docs/ТЗ.md, 7.4). The form field for it comes with step 27;
// until then every new user gets the default one.

const newUser = (login: string, fullName: string) => ({
  login,
  password: "Secret2026new",
  fullName,
  position: "",
  email: "",
  phone: "",
  role: "EMPLOYEE",
  isActive: true,
  comment: "",
  contractorId: "",
});

async function nicknameOf(login: string) {
  return (await db.user.findUniqueOrThrow({ where: { login } })).nickname;
}

async function waitingLocks() {
  const [{ count }] = await db.$queryRaw<{ count: number }[]>`
    SELECT count(*)::int AS count FROM pg_locks WHERE NOT granted`;
  return count;
}

describe("the default nickname of a new user", () => {
  it("is the first name, then the first name with the surname initial", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    await createUser({ nickname: "иван" });

    await createUserAction(newUser("ivanov", "Иванов Иван Иванович"));

    expect(await nicknameOf("ivanov")).toBe("Иван И.");
  });

  it("waits for a user with the same first name being created at the same time", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const { id: admin } = await createUser({ role: "ADMIN" });

    let inserted!: () => void;
    const competitorInserted = new Promise<void>((resolve) => (inserted = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    // Another creation that has picked "Иван" and not committed yet.
    const competitor = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('User.nickname'))`;
      await tx.user.create({
        data: {
          login: "ignatov",
          fullName: "Игнатов Иван",
          nickname: "Иван",
          passwordHash: "-",
          createdById: admin,
        },
      });
      inserted();
      await released;
    });
    await competitorInserted;

    const result = createUserAction(newUser("ivanov", "Иванов Иван"));
    // The action now waits: for the lock, or without it for the uncommitted "Иван" to commit.
    await expect.poll(waitingLocks, { timeout: 10_000 }).toBeGreaterThan(0);
    release();
    await competitor;

    expect(await result).toMatchObject({ ok: true });
    expect(await nicknameOf("ivanov")).toBe("Иван И.");
  });
});
