import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateOwnProfile, updateUser } from "@/features/users/actions";
import type { Role } from "@/generated/prisma/enums";
import { requireActionSession } from "@/lib/auth/current-user";
import { db } from "@/lib/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/request-info", () => ({
  getClientInfo: async () => ({ ip: "127.0.0.1", userAgent: "vitest" }),
}));
vi.mock("@/lib/auth/current-user", () => ({ requireActionSession: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  invalidateSession: vi.fn(),
  invalidateAllUserSessions: vi.fn(),
}));
// The transaction client is the database mock itself, so a refused change leaves no writes on it.
vi.mock("@/lib/db", () => {
  const db = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((work: (client: unknown) => unknown) => work(db)),
  };
  return { db };
});

const ACTOR_ID = "cjld2cjxh0001qzrmn831i7rn";
const TARGET_ID = "cjld2cjxh0000qzrmn831i7rn";
const OTHER_ADMIN_ID = "cjld2cjxh0002qzrmn831i7rn";

const refused = { ok: false, error: "errors.forbiddenAction" };

function actingAs(role: Role) {
  vi.mocked(requireActionSession).mockResolvedValue({
    session: { id: "cjld2cyuq0001t3rmniod1foy", expiresAt: new Date("2026-09-15T00:00:00Z") },
    user: { id: ACTOR_ID, login: "actor", fullName: "Acting User", role },
  });
}

type StoredUser = {
  login: string;
  fullName: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  isActive: boolean;
  comment: string | null;
};

function givenTarget(overrides: Partial<StoredUser> = {}): StoredUser {
  const user: StoredUser = {
    login: "petrov",
    fullName: "Petr Petrov",
    position: null,
    email: null,
    phone: null,
    role: "EMPLOYEE",
    isActive: true,
    comment: null,
    ...overrides,
  };
  vi.mocked(db.user.findUnique).mockResolvedValue(user as never);
  vi.mocked(db.user.findUniqueOrThrow).mockResolvedValue(user as never);
  return user;
}

function formValues(user: StoredUser) {
  return {
    fullName: user.fullName,
    position: user.position ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: user.role,
    isActive: user.isActive,
    comment: user.comment ?? "",
  };
}

function loggedEntries() {
  return vi.mocked(db.auditLog.create).mock.calls.map(([args]) => args.data);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.$queryRaw).mockResolvedValue([{ id: OTHER_ADMIN_ID }, { id: ACTOR_ID }]);
});

describe("updateUser called by MANAGER", () => {
  it("changes the profile of an employee and logs the change", async () => {
    actingAs("MANAGER");
    const target = givenTarget();

    const result = await updateUser(TARGET_ID, { ...formValues(target), position: "Прораб" });

    expect(result).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: expect.objectContaining({ position: "Прораб", updatedById: ACTOR_ID }),
    });
    expect(loggedEntries()).toEqual([
      expect.objectContaining({
        action: "UPDATE",
        actorId: ACTOR_ID,
        entityId: TARGET_ID,
        changes: [{ field: "position", before: null, after: "Прораб" }],
      }),
    ]);
  });

  it.each<[string, Partial<StoredUser>, Partial<ReturnType<typeof formValues>>]>([
    ["the profile of an administrator", { role: "ADMIN" }, { position: "Прораб" }],
    ["the comment", {}, { comment: "Уволен" }],
    ["the role", {}, { role: "MANAGER" }],
    ["the status", {}, { isActive: false }],
  ])("is refused changing %s", async (_, stored, submitted) => {
    actingAs("MANAGER");
    const target = givenTarget(stored);

    await expect(updateUser(TARGET_ID, { ...formValues(target), ...submitted })).resolves.toEqual(
      refused,
    );
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("updateUser called by ADMIN", () => {
  it("changes the profile and the comment of another administrator", async () => {
    actingAs("ADMIN");
    const target = givenTarget({ role: "ADMIN" });

    const result = await updateUser(TARGET_ID, { ...formValues(target), comment: "Отпуск" });

    expect(result).toEqual({ ok: true });
    expect(loggedEntries()).toEqual([
      expect.objectContaining({
        action: "UPDATE",
        changes: [{ field: "comment", before: null, after: "Отпуск" }],
      }),
    ]);
  });
});

describe("updateOwnProfile", () => {
  it.each<Role>(["ADMIN", "MANAGER"])(
    "logs a change made by %s to their own account",
    async (role) => {
      actingAs(role);
      const own = givenTarget({ login: "actor", role });

      const result = await updateOwnProfile({ ...formValues(own), phone: " +380 44 000 00 00 " });

      expect(result).toEqual({ ok: true });
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: ACTOR_ID },
        data: expect.objectContaining({ phone: "+380 44 000 00 00", updatedById: ACTOR_ID }),
      });
      expect(loggedEntries()).toEqual([
        expect.objectContaining({
          action: "UPDATE",
          entity: "User",
          actorId: ACTOR_ID,
          entityId: ACTOR_ID,
          changes: [{ field: "phone", before: null, after: "+380 44 000 00 00" }],
        }),
      ]);
    },
  );

  it("ignores a role, a status and a comment sent along with the profile", async () => {
    actingAs("MANAGER");
    const own = givenTarget({ role: "MANAGER" });

    await updateOwnProfile({
      ...formValues(own),
      fullName: "Petr Petrovich",
      role: "ADMIN",
      isActive: false,
      comment: "Сам себе администратор",
    });

    const [[{ data }]] = vi.mocked(db.user.update).mock.calls;
    expect(Object.keys(data).sort()).toEqual(
      ["email", "fullName", "phone", "position", "updatedById"].sort(),
    );
  });

  it("writes nothing when nothing has changed", async () => {
    actingAs("MANAGER");
    const own = givenTarget({ role: "MANAGER" });

    await expect(updateOwnProfile(formValues(own))).resolves.toEqual({ ok: true });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });
});
