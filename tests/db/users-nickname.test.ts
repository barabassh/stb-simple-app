import { describe, expect, it } from "vitest";

import {
  createUser as createUserAction,
  updateOwnProfile,
  updateUser,
} from "@/features/users/actions";
import { parseUsersListParams } from "@/features/users/list-params";
import { suggestedNickname } from "@/features/users/nickname";
import { listUsers } from "@/features/users/queries";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser, editFormOf } from "./helpers";

// The nickname of a user (docs/ТЗ.md, 7.4): the default one of a new user, one typed by hand,
// and who may change it (docs/ПРАВА-ДОСТУПА.md, 22).

const taken = { ok: false, fieldErrors: { nickname: ["users.errors.nicknameTaken"] } };

const newUser = (login: string, fullName: string) => ({
  login,
  password: "Secret2026new",
  fullName,
  nickname: suggestedNickname(fullName, login),
  nicknameEdited: false,
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

describe("a nickname typed by hand", () => {
  it("is saved as typed, even when the default one would differ", async () => {
    await actAs(await createUser({ role: "ADMIN" }));

    const result = await createUserAction({
      ...newUser("ivanov", "Иванов Иван"),
      nickname: "  Ваня   Иванов ",
      nicknameEdited: true,
    });

    expect(result).toMatchObject({ ok: true });
    expect(await nicknameOf("ivanov")).toBe("Ваня Иванов");
  });

  it("taken in another case is a field error, not replaced by a free one", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    await createUser({ nickname: "Иван" });

    await expect(
      createUserAction({
        ...newUser("ivanov", "Иванов Иван"),
        nicknameEdited: true,
        nickname: "иван",
      }),
    ).resolves.toEqual(taken);

    expect(await db.user.count({ where: { login: "ivanov" } })).toBe(0);
  });
});

describe("changing a nickname", () => {
  it("is refused as taken in another case, in the user form and in one's own profile", async () => {
    const manager = await createUser({ role: "MANAGER", nickname: "Пётр" });
    const employee = await createUser({ nickname: "Сидор" });
    await createUser({ nickname: "Иван" });
    await actAs(manager);

    await expect(
      updateUser(employee.id, { ...(await editFormOf(employee.id)), nickname: "ИВАН" }),
    ).resolves.toEqual(taken);
    await expect(
      updateOwnProfile({ ...(await editFormOf(manager.id)), nickname: "иван" }),
    ).resolves.toEqual(taken);

    expect(await db.user.count({ where: { nickname: { in: ["Сидор", "Пётр"] } } })).toBe(2);
    expect(await auditEntries()).toEqual([]);
  });

  it("is logged as an UPDATE of the user, a change of case included", async () => {
    const manager = await createUser({ role: "MANAGER", nickname: "пётр" });
    const employee = await createUser({ nickname: "Сидор" });
    await actAs(manager);

    await expect(
      updateUser(employee.id, { ...(await editFormOf(employee.id)), nickname: "Сидор С." }),
    ).resolves.toEqual({ ok: true });
    await expect(
      updateOwnProfile({ ...(await editFormOf(manager.id)), nickname: "Пётр" }),
    ).resolves.toEqual({ ok: true });

    const entries = await auditEntries();
    expect(entries).toEqual([
      expect.objectContaining({
        action: "UPDATE",
        entity: "User",
        entityId: employee.id,
        changes: [{ field: "nickname", before: "Сидор", after: "Сидор С." }],
      }),
      expect.objectContaining({
        action: "UPDATE",
        entity: "User",
        entityId: manager.id,
        changes: [{ field: "nickname", before: "пётр", after: "Пётр" }],
      }),
    ]);
  });

  it("of an administrator is refused to a manager calling the action directly", async () => {
    const admin = await createUser({ role: "ADMIN", nickname: "Анна" });
    await actAs(await createUser({ role: "MANAGER" }));

    await expect(
      updateUser(admin.id, { ...(await editFormOf(admin.id)), nickname: "Аня" }),
    ).resolves.toEqual({ ok: false, error: "errors.forbiddenAction" });

    expect(await nicknameOf(admin.login)).toBe("Анна");
    expect(await auditEntries()).toEqual([]);
  });
});

describe("the registry of users", () => {
  it("finds a user by the nickname", async () => {
    const admin = await createUser({ role: "ADMIN" });
    await createUser({ login: "ivanov", nickname: "Ваня" });
    await createUser({ login: "petrov", nickname: "Петя" });

    const { rows } = await listUsers(admin, parseUsersListParams({ q: "ваН" }));

    expect(rows.map(({ login }) => login)).toEqual(["ivanov"]);
  });
});
