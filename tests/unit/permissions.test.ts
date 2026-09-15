import { describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import {
  can,
  PermissionDeniedError,
  requirePermission,
  userUpdatePermission,
  type Permission,
} from "@/lib/permissions";

const EVERY_ROLE = Object.values(Role);

// docs/ПРАВА-ДОСТУПА.md, section 2: the roles that hold each permission.
const MATRIX: Record<Permission, Role[]> = {
  "users.read": ["ADMIN", "MANAGER"],
  "users.history.read": ["ADMIN", "MANAGER"],
  "users.create": ["ADMIN"],
  "users.update": ["ADMIN"],
  "users.updateProfile": ["ADMIN", "MANAGER"],
  "users.changeRole": ["ADMIN"],
  "users.resetPassword": ["ADMIN"],
  "users.changeStatus": ["ADMIN"],
  "users.sessions.read": ["ADMIN"],
  "users.sessions.revoke": ["ADMIN"],
  "users.export": ["ADMIN", "MANAGER"],
  "audit.read": ["ADMIN"],
  "audit.export": ["ADMIN"],
  "profile.read": EVERY_ROLE,
  "profile.update": ["ADMIN", "MANAGER"],
  "profile.sessions": EVERY_ROLE,
};

describe("can", () => {
  it.each<[Role, Permission]>([
    ["ADMIN", "users.sessions.revoke"],
    ["MANAGER", "users.updateProfile"],
    ["EMPLOYEE", "profile.read"],
    ["CONTRACTOR", "profile.sessions"],
  ])("allows %s %s", (role, permission) => {
    expect(can({ role }, permission)).toBe(true);
  });

  it.each<[Role, Permission]>([
    // An administrator holds every permission defined so far: a section added later
    // must be granted explicitly, a wildcard does not reach beyond its own section.
    ["ADMIN", "projects.read" as Permission],
    ["MANAGER", "users.create"],
    ["EMPLOYEE", "profile.update"],
    ["CONTRACTOR", "audit.read"],
  ])("denies %s %s", (role, permission) => {
    expect(can({ role }, permission)).toBe(false);
  });

  it("follows the matrix of the access rules document", () => {
    for (const [permission, roles] of Object.entries(MATRIX)) {
      for (const role of EVERY_ROLE) {
        expect(can({ role }, permission as Permission), `${role} ${permission}`).toBe(
          roles.includes(role),
        );
      }
    }
  });
});

describe("userUpdatePermission", () => {
  it.each<[Role, Role, boolean]>([
    ["ADMIN", "ADMIN", true],
    ["ADMIN", "CONTRACTOR", true],
    ["MANAGER", "ADMIN", false],
    ["MANAGER", "MANAGER", true],
    ["MANAGER", "EMPLOYEE", true],
    ["EMPLOYEE", "EMPLOYEE", false],
    ["CONTRACTOR", "CONTRACTOR", false],
  ])("lets %s edit the profile of %s: %s", (actor, target, allowed) => {
    expect(can({ role: actor }, userUpdatePermission({ role: target }))).toBe(allowed);
  });
});

describe("requirePermission", () => {
  it("passes a role that holds the permission", () => {
    expect(() => requirePermission({ role: "MANAGER" }, "users.read")).not.toThrow();
  });

  it("throws PermissionDeniedError for a role that does not", () => {
    expect(() => requirePermission({ role: "MANAGER" }, "users.update")).toThrow(
      PermissionDeniedError,
    );
  });
});
