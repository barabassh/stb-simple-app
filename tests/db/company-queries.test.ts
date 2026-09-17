import { describe, expect, it } from "vitest";

import { getCompanyProfile, getCompanyProfileId } from "@/features/company/queries";
import { db } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";

import { createUser } from "./helpers";

describe("getCompanyProfile", () => {
  it("refuses a role without access to the company profile", async () => {
    const employee = await createUser({ role: "EMPLOYEE" });

    await expect(getCompanyProfile(employee)).rejects.toThrow(PermissionDeniedError);
  });

  it("returns null until the profile is filled", async () => {
    const manager = await createUser({ role: "MANAGER" });

    await expect(getCompanyProfile(manager)).resolves.toBeNull();
  });

  it("leaves out deleted addresses and keeps the lists in their order", async () => {
    const admin = await createUser({ role: "ADMIN" });
    const address = { postcode: "3741 RS", city: "Baarn" };
    await db.companyProfile.create({
      data: {
        legalName: "Bouw B.V.",
        legalForm: "BV",
        email: "info@bouw.nl",
        phone: "+31684614732",
        addresses: {
          create: [
            { ...address, type: "OFFICE" },
            { ...address, type: "WAREHOUSE", name: "Second", sortOrder: 1 },
            { ...address, type: "WAREHOUSE", name: "Deleted", sortOrder: 0, deletedAt: new Date() },
            { ...address, type: "WAREHOUSE", name: "First", sortOrder: 0 },
          ],
        },
        phones: {
          create: [
            { number: "+31201234567", sortOrder: 1 },
            { number: "+31684614732", sortOrder: 0 },
          ],
        },
        activities: {
          create: [
            { sbiCode: "4399", description: "Other", sortOrder: 1 },
            { sbiCode: "4120", description: "Main", isMain: true, sortOrder: 0 },
          ],
        },
      },
    });

    const profile = await getCompanyProfile(admin);

    const warehouses = profile?.addresses.filter(({ type }) => type === "WAREHOUSE");
    expect(warehouses?.map(({ name }) => name)).toEqual(["First", "Second"]);
    expect(profile?.phones.map(({ number }) => number)).toEqual(["+31684614732", "+31201234567"]);
    expect(profile?.activities.map(({ sbiCode }) => sbiCode)).toEqual(["4120", "4399"]);
  });
});

describe("getCompanyProfileId", () => {
  it("refuses a role without the company profile history", async () => {
    const contractor = await createUser({ role: "CONTRACTOR" });

    await expect(getCompanyProfileId(contractor)).rejects.toThrow(PermissionDeniedError);
  });

  it("returns the id once the profile is filled", async () => {
    const manager = await createUser({ role: "MANAGER" });
    await expect(getCompanyProfileId(manager)).resolves.toBeNull();

    const { id } = await db.companyProfile.create({ data: { legalName: "Bouw B.V." } });

    await expect(getCompanyProfileId(manager)).resolves.toBe(id);
  });
});
