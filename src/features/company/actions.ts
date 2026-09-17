"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import type { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction, type ActionActor } from "@/lib/auth/authorized-action";
import { db } from "@/lib/db";
import { getClientInfo } from "@/lib/request-info";

import { companyAuditSnapshot } from "./audit";
import { companyFormValues } from "./form-values";
import { findCompanyProfile } from "./queries";
import { companyFormSchema, isBlankAddress, type CompanyFormValues } from "./schemas";

const SETTINGS_PATH = "/settings";

const concurrentUpdate: ActionFailure = {
  ok: false,
  error: "settings.company.errors.concurrentUpdate",
};

/** Field errors keyed by the full path the form knows them by, e.g. "warehouses.0.postcode". */
function validationFailure(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

function profileData(values: CompanyFormValues) {
  return {
    legalName: values.legalName,
    tradeName: values.tradeName || null,
    legalForm: values.legalForm ?? null,
    registeredOn: values.registeredOn ? new Date(`${values.registeredOn}T00:00:00Z`) : null,
    statutorySeat: values.statutorySeat || null,
    kvkNumber: values.kvkNumber || null,
    establishmentNumber: values.establishmentNumber || null,
    rsin: values.rsin || null,
    vatId: values.vatId || null,
    vatNumber: values.vatNumber || null,
    payrollTaxNumber: values.payrollTaxNumber || null,
    email: values.email || null,
    phone: values.phone || null,
    website: values.website || null,
    activityDescription: values.activityDescription || null,
    postalSameAsOffice: values.postalSameAsOffice,
  };
}

type AddressInput = {
  id?: string;
  name?: string;
  isPostbus?: boolean;
  street: string;
  houseNumber: string;
  houseNumberAddition: string;
  postbus?: string;
  postcode: string;
  city: string;
  country: string;
};

function addressData(address: AddressInput, sortOrder: number) {
  const isPostbus = address.isPostbus ?? false;
  return {
    name: address.name || null,
    street: isPostbus ? null : address.street || null,
    houseNumber: isPostbus || !address.houseNumber ? null : Number(address.houseNumber),
    houseNumberAddition: isPostbus ? null : address.houseNumberAddition || null,
    postbus: isPostbus ? address.postbus || null : null,
    postcode: address.postcode || null,
    city: address.city || null,
    country: address.country,
    sortOrder,
  };
}

type AddressData = ReturnType<typeof addressData>;

/**
 * The addresses the form asks for; the office and postal ones are matched by type, not by id.
 * An office or postal address left empty is not kept (blank warehouses are dropped by the schema).
 */
function wantedAddresses(values: CompanyFormValues) {
  return [
    ...(isBlankAddress(values.officeAddress)
      ? []
      : [{ type: "OFFICE" as const, id: undefined, data: addressData(values.officeAddress, 0) }]),
    ...(values.postalSameAsOffice || isBlankAddress(values.postalAddress)
      ? []
      : [{ type: "POSTAL" as const, id: undefined, data: addressData(values.postalAddress, 0) }]),
    ...values.warehouses.map((warehouse, index) => ({
      type: "WAREHOUSE" as const,
      id: warehouse.id,
      data: addressData(warehouse, index),
    })),
  ];
}

const sameAddress = (stored: AddressData, wanted: AddressData) =>
  (Object.keys(wanted) as (keyof AddressData)[]).every((key) => stored[key] === wanted[key]);

/**
 * Addresses are updated in place, because warehouses will be referenced by later stages; a
 * warehouse left out of the form, and a postal address no longer needed, are soft-deleted.
 */
async function saveAddresses(
  tx: Prisma.TransactionClient,
  companyId: string,
  actor: ActionActor,
  values: CompanyFormValues,
) {
  const stored = await tx.companyAddress.findMany({ where: { companyId, deletedAt: null } });
  const kept = new Set<string>();

  for (const { type, id, data } of wantedAddresses(values)) {
    const match = stored.find(
      (address) =>
        address.type === type &&
        !kept.has(address.id) &&
        (type === "WAREHOUSE" ? address.id === id : true),
    );

    if (!match) {
      await tx.companyAddress.create({
        data: { ...data, type, companyId, createdById: actor.id, updatedById: actor.id },
      });
      continue;
    }

    kept.add(match.id);
    if (!sameAddress(match, data)) {
      await tx.companyAddress.update({
        where: { id: match.id },
        data: { ...data, updatedById: actor.id },
      });
    }
  }

  const removed = stored.filter((address) => !kept.has(address.id)).map(({ id }) => id);
  if (removed.length > 0) {
    await tx.companyAddress.updateMany({
      where: { id: { in: removed } },
      data: { deletedAt: new Date(), updatedById: actor.id },
    });
  }
}

/** Phones, social links and activities belong to the profile alone and are replaced whole. */
async function replaceLists(
  tx: Prisma.TransactionClient,
  companyId: string,
  values: CompanyFormValues,
) {
  const where = { companyId };
  await tx.companyPhone.deleteMany({ where });
  await tx.companySocialLink.deleteMany({ where });
  await tx.companyActivity.deleteMany({ where });
  await tx.companyPhone.createMany({
    data: values.phones.map(({ label, number }, sortOrder) => ({
      companyId,
      label: label || null,
      number: number || null,
      sortOrder,
    })),
  });
  await tx.companySocialLink.createMany({
    data: values.socialLinks.map(({ network, url }, sortOrder) => ({
      companyId,
      network: network ?? null,
      url: url || null,
      sortOrder,
    })),
  });
  await tx.companyActivity.createMany({
    data: values.activities.map(({ sbiCode, description, isMain }, sortOrder) => ({
      companyId,
      sbiCode: sbiCode || null,
      description: description || null,
      isMain,
      sortOrder,
    })),
  });
}

/**
 * The form is saved whole (docs/ТЗ.md, 5.7). The version it was opened with guards against
 * overwriting a save made by someone else in the meantime (docs/СХЕМА-БД.md, 8.3).
 */
export const saveCompanyProfile = authorizedAction(
  "settings.company.update",
  async (actor, input: unknown): Promise<ActionResult> => {
    const parsed = companyFormSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;

    // Read outside the transaction: every save increments the version and the update below is
    // conditional on it, so a save committed after this read is still caught.
    const current = await findCompanyProfile();
    if ((current?.version ?? 0) !== values.version) return concurrentUpdate;

    const [t, locale, request] = await Promise.all([
      getTranslations(),
      getLocale(),
      getClientInfo(),
    ]);
    const changes = diffEntity(
      current && companyAuditSnapshot(companyFormValues(current), t, locale),
      companyAuditSnapshot(values, t, locale),
    );
    // An unchanged form writes nothing and keeps the version, so an open form stays valid.
    if (current && changes.length === 0) return { ok: true };

    try {
      const result = await db.$transaction(async (tx): Promise<ActionResult> => {
        let companyId: string;
        if (current) {
          const { count } = await tx.companyProfile.updateMany({
            where: { id: current.id, version: values.version },
            data: { ...profileData(values), version: { increment: 1 }, updatedById: actor.id },
          });
          if (count === 0) return concurrentUpdate;
          companyId = current.id;
        } else {
          ({ id: companyId } = await tx.companyProfile.create({
            data: { ...profileData(values), createdById: actor.id, updatedById: actor.id },
            select: { id: true },
          }));
        }

        await saveAddresses(tx, companyId, actor, values);
        await replaceLists(tx, companyId, values);
        await logAudit(tx, {
          ...request,
          actor,
          action: current ? "UPDATE" : "CREATE",
          entity: "CompanyProfile",
          entityId: companyId,
          summary: t(
            current
              ? "audit.summaries.companyProfileUpdated"
              : "audit.summaries.companyProfileCreated",
          ),
          changes,
        });
        return { ok: true };
      });

      if (result.ok) revalidatePath(SETTINGS_PATH);
      return result;
    } catch (error) {
      // Two first saves at once: the second one hits the unique singleton instead of a duplicate.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return concurrentUpdate;
      }
      throw error;
    }
  },
);
