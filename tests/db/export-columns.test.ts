import { describe, expect, it } from "vitest";

import { saveExportColumns } from "@/features/export/actions";
import { getExportColumnChoice } from "@/features/export/queries";
import { reportsExport } from "@/features/reports/export";
import { usersExport } from "@/features/users/export";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

import { actAs, auditEntries, createUser, exportDocument } from "./helpers";
import { t } from "./translations";

// The choice of columns of an export (docs/ТЗ.md, 4.11), with the action called directly as a
// request that bypasses the interface would.

const forbidden = { ok: false, error: "errors.forbiddenAction" };
const invalidRequest = { ok: false, error: "errors.invalidRequest" };

describe("the columns of an export", () => {
  it("are those the link names, in its order, with the totals label in the first", async () => {
    const manager = await createUser({ role: "MANAGER" });

    const content = await exportDocument(manager, reportsExport, {
      columns: "mileageKm,hours,workDate,passwordHash",
    });
    expect(content.columns.map((column) => column.key)).toEqual(["mileageKm", "hours", "workDate"]);

    const withoutDate = await exportDocument(manager, reportsExport, {
      columns: "worker,hours,worker",
    });
    expect(withoutDate.columns.map((column) => column.key)).toEqual(["worker", "hours"]);
    expect(withoutDate.totals).toEqual({ hours: 0, mileageKm: 0 });
  });

  it("are all of them without the parameter or when it names none of them", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const all = (await reportsExport.columns(manager)).map((column) => column.key);

    for (const searchParams of [{}, { columns: "" }, { columns: "passwordHash" }]) {
      const content = await exportDocument(manager, reportsExport, searchParams, "pdf");
      expect(content.columns.map((column) => column.key)).toEqual(all);
    }
  });
});

describe("the choice of columns", () => {
  it("is remembered per report and user, in the report's order, without an audit entry", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const other = await createUser({ role: "MANAGER" });

    await actAs(manager);
    await expect(
      saveExportColumns({
        report: "reports",
        hidden: ["approvedBy", "nickname", "unknown"],
        order: ["hours", "unknown", "workDate", "hours"],
      }),
    ).resolves.toEqual({ ok: true });

    const choice = await getExportColumnChoice(manager, reportsExport);
    expect(choice.hidden).toEqual(["nickname", "approvedBy"]);
    // The saved order first, then the report's other columns in its own order.
    expect(choice.columns.slice(0, 3)).toEqual([
      { key: "hours", header: t("reports.export.columns.hours") },
      { key: "workDate", header: t("reports.export.columns.workDate") },
      { key: "worker", header: t("reports.export.columns.worker") },
    ]);
    expect(choice.columns).toHaveLength(15);
    expect(choice.reportOrder[0]).toBe("workDate");
    expect((await getExportColumnChoice(manager, usersExport)).hidden).toEqual([]);
    expect((await getExportColumnChoice(other, reportsExport)).hidden).toEqual([]);
    expect(await auditEntries()).toEqual([]);

    await saveExportColumns({ report: "reports", hidden: [], order: [] });
    const reset = await getExportColumnChoice(manager, reportsExport);
    expect(reset.hidden).toEqual([]);
    expect(reset.columns.map((column) => column.key)).toEqual(reset.reportOrder);
  });

  it("offers every column again when every one was left out", async () => {
    const manager = await createUser({ role: "MANAGER" });
    const keys = (await usersExport.columns(manager)).map((column) => column.key);

    await actAs(manager);
    await saveExportColumns({ report: "users", hidden: keys, order: [] });
    expect((await getExportColumnChoice(manager, usersExport)).hidden).toEqual([]);
  });

  it("is refused for a report the user may not export", async () => {
    const employee = await createUser({ role: "EMPLOYEE" });
    const manager = await createUser({ role: "MANAGER" });

    await actAs(employee);
    await expect(
      saveExportColumns({ report: "reports", hidden: ["nickname"], order: [] }),
    ).resolves.toEqual(forbidden);
    await actAs(manager);
    await expect(
      saveExportColumns({ report: "audit", hidden: ["ip"], order: [] }),
    ).resolves.toEqual(forbidden);
    await expect(getExportColumnChoice(employee, reportsExport)).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
    expect(await db.userPreference.count()).toBe(0);
  });

  it("refuses what is not a choice of columns", async () => {
    const manager = await createUser({ role: "MANAGER" });

    await actAs(manager);
    for (const input of [
      { report: "nothing", hidden: [], order: [] },
      { report: "reports", hidden: "nickname", order: [] },
      { report: "reports", hidden: [] },
      null,
      ["nickname"],
    ]) {
      await expect(saveExportColumns(input)).resolves.toEqual(invalidRequest);
    }
    expect(await db.userPreference.count()).toBe(0);
  });
});
