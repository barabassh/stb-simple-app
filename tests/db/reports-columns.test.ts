import { describe, expect, it } from "vitest";

import { saveReportColumnSizes, saveReportColumns } from "@/features/reports/actions";
import { getReportTableSettings } from "@/features/reports/queries";
import { db } from "@/lib/db";

import { actAs, auditEntries, createUser } from "./helpers";

// The column settings of the reports' tables (docs/ТЗ.md, 7.9; docs/СХЕМА-БД.md, 10.2), with the
// action called directly as a request that bypasses the interface would.

const invalidRequest = { ok: false, error: "errors.invalidRequest" };

async function getHiddenReportColumns(user: Parameters<typeof getReportTableSettings>[0]) {
  return (await getReportTableSettings(user)).hiddenColumns;
}

describe("the column settings of the reports", () => {
  it("keeps the hidden columns in the user's profile, in the table's order", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const other = await createUser({ role: "MANAGER" });
    expect(await getHiddenReportColumns(manager)).toEqual([]);

    await actAs(manager);
    await expect(saveReportColumns(["updatedAt", "lunchMinutes", "lunchMinutes"])).resolves.toEqual(
      { ok: true },
    );
    expect(await getHiddenReportColumns(manager)).toEqual(["lunchMinutes", "updatedAt"]);
    expect(await getHiddenReportColumns(other)).toEqual([]);

    await expect(saveReportColumns([])).resolves.toEqual({ ok: true });
    expect(await getHiddenReportColumns(manager)).toEqual([]);
  });

  it("drops the columns the role does not see or may not hide", async () => {
    const worker = await createUser({ role: "CONTRACTOR" });

    await actAs(worker);
    await saveReportColumns(["worker", "updatedAt", "workDate", "mileageKm"]);
    expect(await getHiddenReportColumns(worker)).toEqual(["mileageKm"]);
  });

  it("refuses what is not a list of the table's columns", async () => {
    const manager = await createUser({ role: "MANAGER" });

    await actAs(manager);
    for (const input of [["passwordHash"], "lunchMinutes", null, { hiddenColumns: [] }]) {
      await expect(saveReportColumns(input)).resolves.toEqual(invalidRequest);
    }
    expect(await db.userPreference.count()).toBe(0);
  });

  it("is not logged and does not change when the account was updated", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const before = await db.user.findUniqueOrThrow({
      where: { id: manager.id },
      select: { updatedAt: true },
    });

    await actAs(manager);
    await saveReportColumns(["lunchMinutes"]);

    expect(await auditEntries()).toEqual([]);
    const after = await db.user.findUniqueOrThrow({
      where: { id: manager.id },
      select: { updatedAt: true },
    });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it("reads settings it cannot understand as none hidden", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await db.userPreference.create({
      data: { userId: manager.id, tables: { reports: { hiddenColumns: "lunchMinutes" } } },
    });

    expect(await getHiddenReportColumns(manager)).toEqual([]);
  });

  it("keeps the settings of other tables when saving the reports'", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await db.userPreference.create({
      data: { userId: manager.id, tables: { projects: { hiddenColumns: ["city"] } } },
    });

    await actAs(manager);
    await saveReportColumns(["hours"]);

    const { tables } = await db.userPreference.findUniqueOrThrow({
      where: { userId: manager.id },
    });
    expect(tables).toEqual({
      projects: { hiddenColumns: ["city"] },
      reports: { hiddenColumns: ["hours"] },
    });
  });

  it("keeps the widths the user dragged columns to, next to the hidden columns", async () => {
    const manager = await createUser({ role: "MANAGER" });

    await actAs(manager);
    await saveReportColumns(["lunchMinutes"]);
    await expect(saveReportColumnSizes({ project: 320, weekday: 90 })).resolves.toEqual({
      ok: true,
    });
    expect(await getReportTableSettings(manager)).toEqual({
      hiddenColumns: ["lunchMinutes"],
      columnSizes: { weekday: 90, project: 320 },
    });

    // Saving one setting leaves the other as it was.
    await saveReportColumns([]);
    await saveReportColumnSizes({ project: 200 });
    expect(await getReportTableSettings(manager)).toEqual({
      hiddenColumns: [],
      columnSizes: { project: 200 },
    });
    expect(await auditEntries()).toEqual([]);
  });

  it("refuses widths out of range or of unknown columns, and drops those the role does not see", async () => {
    const worker = await createUser({ role: "EMPLOYEE" });

    await actAs(worker);
    for (const input of [
      { project: 59 },
      { project: 801 },
      { project: 150.5 },
      { select: 80 },
      [120],
    ]) {
      await expect(saveReportColumnSizes(input)).resolves.toEqual(invalidRequest);
    }
    await saveReportColumnSizes({ worker: 150, updatedAt: 150, hours: 70 });
    expect((await getReportTableSettings(worker)).columnSizes).toEqual({ hours: 70 });
  });
});
