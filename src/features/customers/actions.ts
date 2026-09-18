"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction } from "@/lib/auth/authorized-action";
import { db } from "@/lib/db";
import { isBlankAddress } from "@/lib/nl/schemas";
import { getClientInfo } from "@/lib/request-info";

import { customerAuditSnapshot } from "./audit";
import { customerFormValues } from "./form-values";
import { customerFormSchema, type CustomerFormValues } from "./schemas";

// Customers are never deleted: projects and the audit log reference them, so they are archived
// (`isActive: false`) instead (docs/ТЗ.md, 6.4).

const CUSTOMERS_PATH = "/customers";

const notFound: ActionFailure = { ok: false, error: "customers.errors.notFound" };
const invalidRequest: ActionFailure = { ok: false, error: "errors.invalidRequest" };
const kvkTaken: ActionFailure = {
  ok: false,
  fieldErrors: { kvkNumber: ["customers.errors.kvkTaken"] },
};

const customerIdSchema = z.cuid();

function validationFailure(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

/** The stored row. An address is kept whole or not at all, so a blank one clears every field. */
function customerData(values: CustomerFormValues) {
  const { address } = values;
  const blank = isBlankAddress(address);

  return {
    type: values.type,
    name: values.name,
    kvkNumber: values.kvkNumber || null,
    vatId: values.vatId || null,
    contactPerson: values.contactPerson || null,
    email: values.email || null,
    phone: values.phone || null,
    street: blank ? null : address.street,
    houseNumber: blank ? null : Number(address.houseNumber),
    houseNumberAddition: blank ? null : address.houseNumberAddition || null,
    postcode: blank ? null : address.postcode,
    city: blank ? null : address.city,
    country: blank ? null : address.country,
    comment: values.comment || null,
  };
}

/** Called once the input is valid: an invalid request is not worth reading the request for. */
async function auditContext() {
  const [t, locale, request] = await Promise.all([getTranslations(), getLocale(), getClientInfo()]);
  return { t, locale, request };
}

/**
 * The unique KvK-nummer is shared with archived customers, so a taken number is reported under
 * its field instead of failing the save.
 */
function uniqueViolation(error: unknown): ActionFailure | null {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    ? kvkTaken
    : null;
}

export const createCustomer = authorizedAction(
  "customers.create",
  async (actor, input: unknown): Promise<ActionResult<{ id: string }>> => {
    const parsed = customerFormSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;
    const { t, locale, request } = await auditContext();

    try {
      const id = await db.$transaction(async (tx) => {
        const { id } = await tx.customer.create({
          data: { ...customerData(values), createdById: actor.id, updatedById: actor.id },
          select: { id: true },
        });
        await logAudit(tx, {
          ...request,
          actor,
          action: "CREATE",
          entity: "Customer",
          entityId: id,
          summary: t("audit.summaries.customerCreated", { name: values.name }),
          changes: diffEntity(
            null,
            customerAuditSnapshot({ ...values, isActive: true }, t, locale),
          ),
        });
        return id;
      });

      revalidatePath(CUSTOMERS_PATH, "layout");
      return { ok: true, id };
    } catch (error) {
      const failure = uniqueViolation(error);
      if (failure) return failure;
      throw error;
    }
  },
);

export const updateCustomer = authorizedAction(
  "customers.update",
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!customerIdSchema.safeParse(id).success) return notFound;
    const parsed = customerFormSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;
    const { t, locale, request } = await auditContext();

    try {
      const result = await db.$transaction(async (tx): Promise<ActionResult> => {
        const target = await tx.customer.findUnique({ where: { id } });
        if (!target) return notFound;

        const changes = diffEntity(
          customerAuditSnapshot(
            { ...customerFormValues(target), isActive: target.isActive },
            t,
            locale,
          ),
          customerAuditSnapshot({ ...values, isActive: target.isActive }, t, locale),
        );
        // An unchanged form writes nothing, so "Изменено" keeps pointing at the last real change.
        if (changes.length === 0) return { ok: true };

        await tx.customer.update({
          where: { id },
          data: { ...customerData(values), updatedById: actor.id },
        });
        await logAudit(tx, {
          ...request,
          actor,
          action: "UPDATE",
          entity: "Customer",
          entityId: id,
          summary: t("audit.summaries.customerUpdated", { name: values.name }),
          changes,
        });
        return { ok: true };
      });

      if (result.ok) revalidatePath(CUSTOMERS_PATH, "layout");
      return result;
    } catch (error) {
      const failure = uniqueViolation(error);
      if (failure) return failure;
      throw error;
    }
  },
);

/** Moves a customer to the archive (`isActive: false`) or brings it back. */
export const changeCustomerStatus = authorizedAction(
  "customers.changeStatus",
  async (actor, id: string, isActive: boolean): Promise<ActionResult> => {
    if (!customerIdSchema.safeParse(id).success) return notFound;
    if (!z.boolean().safeParse(isActive).success) return invalidRequest;
    const { t, locale, request } = await auditContext();

    const result = await db.$transaction(async (tx): Promise<ActionResult> => {
      const target = await tx.customer.findUnique({ where: { id } });
      if (!target) return notFound;
      // Archiving an archived customer changes nothing and is not worth an entry.
      if (target.isActive === isActive) return { ok: true };

      await tx.customer.update({ where: { id }, data: { isActive, updatedById: actor.id } });
      const values = customerFormValues(target);
      await logAudit(tx, {
        ...request,
        actor,
        action: "STATUS_CHANGE",
        entity: "Customer",
        entityId: id,
        summary: t(
          isActive ? "audit.summaries.customerRestored" : "audit.summaries.customerArchived",
          { name: target.name },
        ),
        changes: diffEntity(
          customerAuditSnapshot({ ...values, isActive: target.isActive }, t, locale),
          customerAuditSnapshot({ ...values, isActive }, t, locale),
        ),
      });
      return { ok: true };
    });

    if (result.ok) revalidatePath(CUSTOMERS_PATH, "layout");
    return result;
  },
);
