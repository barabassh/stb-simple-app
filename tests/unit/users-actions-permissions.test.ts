import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUser,
  resetPassword,
  revokeAllUserSessions,
  revokeUserSession,
  toggleStatus,
  updateUser,
} from "@/features/users/actions";
import type { Role } from "@/generated/prisma/enums";
import { requireActionUser } from "@/lib/auth/current-user";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireActionUser: vi.fn() }));
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

function actingAs(role: Role) {
  vi.mocked(requireActionUser).mockResolvedValue({
    id: "cjld2cjxh0001qzrmn831i7rn",
    login: "actor",
    fullName: "Acting User",
    role,
  });
}

const ACTIONS = [
  ["createUser", () => createUser({})],
  ["updateUser", () => updateUser(USER_ID, {})],
  ["resetPassword", () => resetPassword(USER_ID, { password: "short" })],
  ["toggleStatus", () => toggleStatus(USER_ID, false)],
  ["revokeUserSession", () => revokeUserSession(USER_ID, SESSION_ID)],
  ["revokeAllUserSessions", () => revokeAllUserSessions(USER_ID)],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each<Role>(["MANAGER", "EMPLOYEE", "CONTRACTOR"])("users actions called by %s", (role) => {
  it.each(ACTIONS)("%s is refused before validation", async (_, action) => {
    actingAs(role);

    await expect(action()).resolves.toEqual({ ok: false, error: "errors.forbiddenAction" });
  });
});

describe("users actions called by ADMIN", () => {
  it("createUser passes the permission check and reaches validation", async () => {
    actingAs("ADMIN");

    const result = await createUser({});

    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("fieldErrors.login");
  });
});
