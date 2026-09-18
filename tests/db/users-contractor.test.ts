import { describe, expect, it } from "vitest";

import { createUser as createUserAction, updateUser } from "@/features/users/actions";
import type { AuditChange } from "@/lib/audit";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser, editFormOf } from "./helpers";

// The link of a contractor account to its organisation (docs/ТЗ.md, 6.5;
// docs/ПРАВА-ДОСТУПА.md, 13–14).

const refused = { ok: false, error: "errors.forbiddenAction" };

const NEW_CONTRACTOR_USER = {
  login: "jansen",
  password: "Secret2026new",
  fullName: "Kees Jansen",
  position: "",
  email: "",
  phone: "",
  role: "CONTRACTOR",
  isActive: true,
  comment: "",
};

function createContractor(name: string, isActive = true) {
  return db.contractor.create({ data: { name, isActive }, select: { id: true, name: true } });
}

async function linkedUser(contractorId: string) {
  const user = await createUser({ role: "CONTRACTOR" });
  await db.user.update({ where: { id: user.id }, data: { contractorId } });
  return user;
}

async function contractorIdOf(userId: string) {
  return (await db.user.findUniqueOrThrow({ where: { id: userId } })).contractorId;
}

function changesOf(entry: { changes: unknown }) {
  return entry.changes as AuditChange[];
}

describe("the organisation of an account", () => {
  it("is linked by an administrator and logged by name", async () => {
    await actAs(await createUser({ role: "ADMIN" }));
    const contractor = await createContractor("Bouwbedrijf Jansen");

    const result = await createUserAction({ ...NEW_CONTRACTOR_USER, contractorId: contractor.id });

    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(await contractorIdOf(result.id)).toBe(contractor.id);
    const [entry] = await auditEntries();
    expect(changesOf(entry)).toContainEqual({
      field: "contractor",
      before: null,
      after: "Bouwbedrijf Jansen",
    });
  });

  it("cannot be passed by a manager, not even empty", async () => {
    const contractor = await createContractor("Bouwbedrijf Jansen");
    const target = await linkedUser(contractor.id);
    const other = await createContractor("Schilder de Vries");
    await actAs(await createUser({ role: "MANAGER" }));
    const form = await editFormOf(target.id);

    await expect(
      createUserAction({ ...NEW_CONTRACTOR_USER, contractorId: other.id }),
    ).resolves.toEqual(refused);
    await expect(updateUser(target.id, { ...form, contractorId: other.id })).resolves.toEqual(
      refused,
    );
    await expect(updateUser(target.id, { ...form, contractorId: "" })).resolves.toEqual(refused);

    expect(await db.user.count({ where: { login: "jansen" } })).toBe(0);
    expect(await contractorIdOf(target.id)).toBe(contractor.id);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("stays when a manager edits the profile of a linked account", async () => {
    const contractor = await createContractor("Bouwbedrijf Jansen");
    const target = await linkedUser(contractor.id);
    await actAs(await createUser({ role: "MANAGER" }));

    await expect(
      updateUser(target.id, { ...(await editFormOf(target.id)), position: "Voorman" }),
    ).resolves.toEqual({ ok: true });

    expect(await contractorIdOf(target.id)).toBe(contractor.id);
  });

  it("cannot be an archived contractor, in a new account or a changed link", async () => {
    const active = await createContractor("Bouwbedrijf Jansen");
    const archived = await createContractor("Oud Bouw B.V.", false);
    const target = await linkedUser(active.id);
    await actAs(await createUser({ role: "ADMIN" }));
    const archivedError = {
      ok: false,
      fieldErrors: { contractorId: ["users.validation.contractorArchived"] },
    };

    await expect(
      createUserAction({ ...NEW_CONTRACTOR_USER, contractorId: archived.id }),
    ).resolves.toEqual(archivedError);
    await expect(
      updateUser(target.id, { ...(await editFormOf(target.id)), contractorId: archived.id }),
    ).resolves.toEqual(archivedError);

    expect(await contractorIdOf(target.id)).toBe(active.id);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("stays on an archived contractor while the account is edited", async () => {
    const contractor = await createContractor("Oud Bouw B.V.");
    const target = await linkedUser(contractor.id);
    await db.contractor.update({ where: { id: contractor.id }, data: { isActive: false } });
    await actAs(await createUser({ role: "ADMIN" }));

    await expect(
      updateUser(target.id, {
        ...(await editFormOf(target.id)),
        position: "Voorman",
        contractorId: contractor.id,
      }),
    ).resolves.toEqual({ ok: true });

    expect(await contractorIdOf(target.id)).toBe(contractor.id);
  });

  it("is refused for another role", async () => {
    const contractor = await createContractor("Bouwbedrijf Jansen");
    await actAs(await createUser({ role: "ADMIN" }));

    await expect(
      createUserAction({ ...NEW_CONTRACTOR_USER, role: "EMPLOYEE", contractorId: contractor.id }),
    ).resolves.toEqual({
      ok: false,
      fieldErrors: { contractorId: ["users.validation.contractorRoleOnly"] },
    });
  });

  it.each([
    ["sent empty", { contractorId: "" }],
    ["left out", {}],
  ])("is removed with the role and logged, the organisation %s", async (_, organisation) => {
    const contractor = await createContractor("Bouwbedrijf Jansen");
    const target = await linkedUser(contractor.id);
    await actAs(await createUser({ role: "ADMIN" }));

    await expect(
      updateUser(target.id, {
        ...(await editFormOf(target.id)),
        role: "EMPLOYEE",
        ...organisation,
      }),
    ).resolves.toEqual({ ok: true });

    expect(await contractorIdOf(target.id)).toBeNull();
    const entries = await auditEntries();
    expect(entries.map(({ action }) => action)).toEqual(["UPDATE", "ROLE_CHANGE"]);
    expect(changesOf(entries[0])).toEqual([
      { field: "contractor", before: "Bouwbedrijf Jansen", after: null },
    ]);
  });

  it("changes from one contractor to another in an UPDATE of the user", async () => {
    const first = await createContractor("Bouwbedrijf Jansen");
    const second = await createContractor("Schilder de Vries");
    const target = await linkedUser(first.id);
    await actAs(await createUser({ role: "ADMIN" }));

    await expect(
      updateUser(target.id, { ...(await editFormOf(target.id)), contractorId: second.id }),
    ).resolves.toEqual({ ok: true });

    const [entry] = await auditEntries();
    expect(entry).toMatchObject({ action: "UPDATE", entity: "User", entityId: target.id });
    expect(changesOf(entry)).toEqual([
      { field: "contractor", before: "Bouwbedrijf Jansen", after: "Schilder de Vries" },
    ]);
  });
});
