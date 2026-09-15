import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUser,
  resetPassword,
  revokeAllUserSessions,
  revokeOwnSession,
  revokeUserSession,
  toggleStatus,
  updateOwnProfile,
  updateUser,
} from "@/features/users/actions";
import type { Role } from "@/generated/prisma/enums";
import { requireActionSession } from "@/lib/auth/current-user";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireActionSession: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  invalidateSession: vi.fn(),
  invalidateAllUserSessions: vi.fn(),
}));
// A refused action has to stop before the database, so any use of it fails the test.
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_, property) => {
        throw new Error(`database used: db.${String(property)}`);
      },
    },
  ),
}));

const USER_ID = "cjld2cjxh0000qzrmn831i7rn";
const SESSION_ID = "cjld2cyuq0000t3rmniod1foy";
const CURRENT_SESSION_ID = "cjld2cyuq0001t3rmniod1foy";

function actingAs(role: Role) {
  vi.mocked(requireActionSession).mockResolvedValue({
    session: { id: CURRENT_SESSION_ID, expiresAt: new Date("2026-09-15T00:00:00Z") },
    user: { id: "cjld2cjxh0001qzrmn831i7rn", login: "actor", fullName: "Acting User", role },
  });
}

const refused = { ok: false, error: "errors.forbiddenAction" };

const ADMINISTRATOR_ACTIONS = [
  ["createUser", () => createUser({})],
  ["resetPassword", () => resetPassword(USER_ID, { password: "short" })],
  ["toggleStatus", () => toggleStatus(USER_ID, false)],
  ["revokeUserSession", () => revokeUserSession(USER_ID, SESSION_ID)],
  ["revokeAllUserSessions", () => revokeAllUserSessions(USER_ID)],
] as const;

const PROFILE_EDITS = [
  ["updateUser", () => updateUser(USER_ID, {})],
  ["updateOwnProfile", () => updateOwnProfile({})],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each<Role>(["MANAGER", "EMPLOYEE", "CONTRACTOR"])("users actions called by %s", (role) => {
  it.each(ADMINISTRATOR_ACTIONS)("%s is refused before validation", async (_, action) => {
    actingAs(role);

    await expect(action()).resolves.toEqual(refused);
  });
});

describe.each<Role>(["EMPLOYEE", "CONTRACTOR"])("profile edits called by %s", (role) => {
  it.each(PROFILE_EDITS)("%s is refused before validation", async (_, action) => {
    actingAs(role);

    await expect(action()).resolves.toEqual(refused);
  });
});

describe("actions passing the permission check reach validation", () => {
  it("createUser called by ADMIN", async () => {
    actingAs("ADMIN");

    const result = await createUser({});

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("fieldErrors.login");
  });

  it.each<Role>(["ADMIN", "MANAGER"])("profile edits called by %s", async (role) => {
    actingAs(role);

    for (const [, action] of PROFILE_EDITS) {
      await expect(action()).resolves.toHaveProperty("fieldErrors.fullName");
    }
  });

  it.each<Role>(["ADMIN", "MANAGER", "EMPLOYEE", "CONTRACTOR"])(
    "revokeOwnSession called by %s does not end the current session",
    async (role) => {
      actingAs(role);

      await expect(revokeOwnSession(CURRENT_SESSION_ID)).resolves.toEqual({
        ok: false,
        error: "users.errors.invalidRequest",
      });
    },
  );
});
