import { describe, expect, it } from "vitest";

import { toggleStatus, updateUser } from "@/features/users/actions";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser, editFormOf } from "./helpers";
import { t } from "./translations";

const lastAdmin = { ok: false, error: "users.errors.lastAdmin" };
const cannotDeactivateSelf = { ok: false, error: "users.errors.cannotDeactivateSelf" };

async function activeAdminLogins() {
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { login: true },
    orderBy: { login: "asc" },
  });
  return admins.map(({ login }) => login);
}

describe("the last active administrator", () => {
  it("cannot give up the administrator role", async () => {
    const admin = await createUser({ login: "admin", role: "ADMIN" });
    await actAs(admin);

    const result = await updateUser(admin.id, { ...(await editFormOf(admin.id)), role: "MANAGER" });

    expect(result).toEqual(lastAdmin);
    expect(await activeAdminLogins()).toEqual(["admin"]);
    expect(await auditEntries()).toEqual([]);
  });

  it("is not saved by a deactivated administrator", async () => {
    const admin = await createUser({ login: "admin", role: "ADMIN" });
    await createUser({ login: "former", role: "ADMIN", isActive: false });
    await actAs(admin);

    const result = await updateUser(admin.id, { ...(await editFormOf(admin.id)), role: "MANAGER" });

    expect(result).toEqual(lastAdmin);
    expect(await activeAdminLogins()).toEqual(["admin"]);
  });

  it("stays when two administrators are removed at the same moment", async () => {
    const admin = await createUser({ login: "admin", role: "ADMIN" });
    const deputy = await createUser({ login: "deputy", role: "ADMIN" });
    await actAs(admin);
    const demotion = { ...(await editFormOf(admin.id)), role: "MANAGER" as const };

    // Each request alone sees another active administrator; only the lock stops the second one.
    const results = await Promise.all([
      toggleStatus(deputy.id, false),
      updateUser(admin.id, demotion),
    ]);

    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual(lastAdmin);
    expect(await activeAdminLogins()).toHaveLength(1);
  });
});

describe("an administrator", () => {
  it("gives up the role while another administrator is active, and it is logged", async () => {
    const admin = await createUser({ login: "admin", role: "ADMIN" });
    await createUser({ login: "deputy", role: "ADMIN" });
    await actAs(admin);

    const result = await updateUser(admin.id, { ...(await editFormOf(admin.id)), role: "MANAGER" });

    expect(result).toEqual({ ok: true });
    expect(await activeAdminLogins()).toEqual(["deputy"]);
    expect(await auditEntries()).toEqual([
      expect.objectContaining({
        action: "ROLE_CHANGE",
        actorLogin: "admin",
        entityId: admin.id,
        changes: [
          { field: "role", before: t("users.roles.ADMIN"), after: t("users.roles.MANAGER") },
        ],
      }),
    ]);
  });

  it("cannot deactivate their own account, even with another administrator active", async () => {
    const admin = await createUser({ login: "admin", role: "ADMIN" });
    await createUser({ login: "deputy", role: "ADMIN" });
    await actAs(admin);

    await expect(toggleStatus(admin.id, false)).resolves.toEqual(cannotDeactivateSelf);
    await expect(
      updateUser(admin.id, { ...(await editFormOf(admin.id)), isActive: false }),
    ).resolves.toEqual(cannotDeactivateSelf);
    expect(await activeAdminLogins()).toEqual(["admin", "deputy"]);
    expect(await auditEntries()).toEqual([]);
  });
});
