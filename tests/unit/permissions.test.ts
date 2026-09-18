import { describe, expect, it } from "vitest";

import { Role } from "@/generated/prisma/enums";
import {
  can,
  canAny,
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
  "users.changeContractor": ["ADMIN"],
  "audit.read": ["ADMIN"],
  "audit.export": ["ADMIN"],
  "profile.read": EVERY_ROLE,
  "profile.update": ["ADMIN", "MANAGER"],
  "profile.sessions": EVERY_ROLE,
  "settings.read": ["ADMIN", "MANAGER"],
  "settings.company.read": ["ADMIN", "MANAGER"],
  "settings.company.update": ["ADMIN", "MANAGER"],
  "settings.company.history": ["ADMIN", "MANAGER"],
  "customers.read": ["ADMIN", "MANAGER", "EMPLOYEE"],
  "customers.create": ["ADMIN", "MANAGER"],
  "customers.update": ["ADMIN", "MANAGER"],
  "customers.changeStatus": ["ADMIN", "MANAGER"],
  "customers.export": ["ADMIN", "MANAGER"],
  "customers.history": ["ADMIN", "MANAGER", "EMPLOYEE"],
  "contractors.read": ["ADMIN", "MANAGER", "EMPLOYEE"],
  "contractors.create": ["ADMIN", "MANAGER"],
  "contractors.update": ["ADMIN", "MANAGER"],
  "contractors.changeStatus": ["ADMIN", "MANAGER"],
  "contractors.export": ["ADMIN", "MANAGER"],
  "contractors.history": ["ADMIN", "MANAGER", "EMPLOYEE"],
  "projects.read": ["ADMIN", "MANAGER", "EMPLOYEE"],
  "projects.readActive": EVERY_ROLE,
  "projects.budget.read": ["ADMIN", "MANAGER"],
  "projects.create": ["ADMIN", "MANAGER"],
  "projects.update": ["ADMIN", "MANAGER"],
  "projects.changeStatus": ["ADMIN", "MANAGER"],
  "projects.delete": ["ADMIN"],
  "projects.export": ["ADMIN", "MANAGER"],
  "projects.history": ["ADMIN", "MANAGER", "EMPLOYEE"],
  "projects.participants": ["ADMIN", "MANAGER"],
  "reports.readOwn": ["EMPLOYEE", "CONTRACTOR"],
  "reports.writeOwn": ["EMPLOYEE", "CONTRACTOR"],
  "reports.read": ["ADMIN", "MANAGER"],
  "reports.write": ["ADMIN", "MANAGER"],
  "reports.approve": ["ADMIN", "MANAGER"],
  "reports.export": ["ADMIN", "MANAGER"],
  "reports.import": ["ADMIN", "MANAGER"],
  "reports.history": ["ADMIN", "MANAGER"],
};

describe("can", () => {
  it.each<[Role, Permission]>([
    ["ADMIN", "users.sessions.revoke"],
    ["MANAGER", "users.updateProfile"],
    ["EMPLOYEE", "profile.read"],
    ["CONTRACTOR", "profile.sessions"],
    ["ADMIN", "settings.company.history"],
    ["MANAGER", "settings.company.update"],
    ["ADMIN", "projects.delete"],
    ["MANAGER", "customers.changeStatus"],
    ["EMPLOYEE", "projects.history"],
    ["CONTRACTOR", "projects.readActive"],
    ["ADMIN", "reports.approve"],
    ["MANAGER", "projects.participants"],
    ["CONTRACTOR", "reports.writeOwn"],
  ])("allows %s %s", (role, permission) => {
    expect(can({ role }, permission)).toBe(true);
  });

  it.each<[Role, Permission]>([
    // An administrator holds every permission defined so far: a section added later
    // must be granted explicitly, a wildcard does not reach beyond its own section.
    ["ADMIN", "expenses.read" as Permission],
    ["MANAGER", "users.create"],
    ["MANAGER", "projects.delete"],
    ["EMPLOYEE", "profile.update"],
    ["EMPLOYEE", "customers.update"],
    ["EMPLOYEE", "projects.budget.read"],
    ["CONTRACTOR", "audit.read"],
    ["CONTRACTOR", "projects.read"],
    ["CONTRACTOR", "customers.read"],
    ["EMPLOYEE", "settings.read"],
    ["CONTRACTOR", "settings.company.read"],
    // Administrators and managers file no reports of their own (docs/ТЗ.md, 7.2).
    ["ADMIN", "reports.readOwn"],
    ["MANAGER", "reports.writeOwn"],
    ["EMPLOYEE", "reports.read"],
    ["CONTRACTOR", "projects.participants"],
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

describe("canAny", () => {
  it.each(EVERY_ROLE)("lets %s open the reports section", (role) => {
    expect(canAny({ role }, ["reports.read", "reports.readOwn"])).toBe(true);
  });

  it("denies a role that holds none of the permissions", () => {
    expect(canAny({ role: "EMPLOYEE" }, ["users.read", "audit.read"])).toBe(false);
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
