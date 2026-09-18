"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction } from "@/lib/auth/authorized-action";
import { db } from "@/lib/db";
import { addressColumns } from "@/lib/nl/schemas";
import { getClientInfo } from "@/lib/request-info";

import { contractorAuditSnapshot } from "./audit";
import { contractorFormValues } from "./form-values";
import { contractorFormSchema, type ContractorFormValues } from "./schemas";

// Contractors are never deleted: user accounts and the audit log reference them, so they are
// archived (`isActive: false`) instead (docs/ТЗ.md, 6.5).

const CONTRACTORS_PATH = "/contractors";

const notFound: ActionFailure = { ok: false, error: "contractors.errors.notFound" };
const invalidRequest: ActionFailure = { ok: false, error: "errors.invalidRequest" };
const kvkTaken: ActionFailure = {
  ok: false,
  fieldErrors: { kvkNumber: ["contractors.errors.kvkTaken"] },
};

const contractorIdSchema = z.cuid();

function validationFailure(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

function contractorData(values: ContractorFormValues) {
  return {
    name: values.name,
    legalForm: values.legalForm ?? null,
    kvkNumber: values.kvkNumber || null,
    vatId: values.vatId || null,
    contactPerson: values.contactPerson || null,
    email: values.email || null,
    phone: values.phone || null,
    ...addressColumns(values.address),
    comment: values.comment || null,
  };
}

/** Called once the input is valid: an invalid request is not worth reading the request for. */
async function auditContext() {
  const [t, locale, request] = await Promise.all([getTranslations(), getLocale(), getClientInfo()]);
  return { t, locale, request };
}

/**
 * The unique KvK-nummer is shared with archived contractors, so a taken number is reported under
 * its field instead of failing the save.
 */
function uniqueViolation(error: unknown): ActionFailure | null {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    ? kvkTaken
    : null;
}

export const createContractor = authorizedAction(
  "contractors.create",
  async (actor, input: unknown): Promise<ActionResult<{ id: string }>> => {
    const parsed = contractorFormSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;
    const { t, locale, request } = await auditContext();

    try {
      const id = await db.$transaction(async (tx) => {
        const { id } = await tx.contractor.create({
          data: { ...contractorData(values), createdById: actor.id, updatedById: actor.id },
          select: { id: true },
        });
        await logAudit(tx, {
          ...request,
          actor,
          action: "CREATE",
          entity: "Contractor",
          entityId: id,
          summary: t("audit.summaries.contractorCreated", { name: values.name }),
          changes: diffEntity(
            null,
            contractorAuditSnapshot({ ...values, isActive: true }, t, locale),
          ),
        });
        return id;
      });

      revalidatePath(CONTRACTORS_PATH, "layout");
      return { ok: true, id };
    } catch (error) {
      const failure = uniqueViolation(error);
      if (failure) return failure;
      throw error;
    }
  },
);

export const updateContractor = authorizedAction(
  "contractors.update",
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!contractorIdSchema.safeParse(id).success) return notFound;
    const parsed = contractorFormSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;
    const { t, locale, request } = await auditContext();

    try {
      const result = await db.$transaction(async (tx): Promise<ActionResult> => {
        const target = await tx.contractor.findUnique({ where: { id } });
        if (!target) return notFound;

        const changes = diffEntity(
          contractorAuditSnapshot(
            { ...contractorFormValues(target), isActive: target.isActive },
            t,
            locale,
          ),
          contractorAuditSnapshot({ ...values, isActive: target.isActive }, t, locale),
        );
        // An unchanged form writes nothing, so "Изменено" keeps pointing at the last real change.
        if (changes.length === 0) return { ok: true };

        await tx.contractor.update({
          where: { id },
          data: { ...contractorData(values), updatedById: actor.id },
        });
        await logAudit(tx, {
          ...request,
          actor,
          action: "UPDATE",
          entity: "Contractor",
          entityId: id,
          summary: t("audit.summaries.contractorUpdated", { name: values.name }),
          changes,
        });
        return { ok: true };
      });

      if (result.ok) revalidatePath(CONTRACTORS_PATH, "layout");
      return result;
    } catch (error) {
      const failure = uniqueViolation(error);
      if (failure) return failure;
      throw error;
    }
  },
);

/**
 * Moves a contractor to the archive (`isActive: false`) or brings it back. Accounts linked to an
 * archived contractor keep the link; it just can no longer be chosen for another account.
 */
export const changeContractorStatus = authorizedAction(
  "contractors.changeStatus",
  async (actor, id: string, isActive: boolean): Promise<ActionResult> => {
    if (!contractorIdSchema.safeParse(id).success) return notFound;
    if (!z.boolean().safeParse(isActive).success) return invalidRequest;
    const { t, locale, request } = await auditContext();

    const result = await db.$transaction(async (tx): Promise<ActionResult> => {
      const target = await tx.contractor.findUnique({ where: { id } });
      if (!target) return notFound;
      // Archiving an archived contractor changes nothing and is not worth an entry.
      if (target.isActive === isActive) return { ok: true };

      await tx.contractor.update({ where: { id }, data: { isActive, updatedById: actor.id } });
      const values = contractorFormValues(target);
      await logAudit(tx, {
        ...request,
        actor,
        action: "STATUS_CHANGE",
        entity: "Contractor",
        entityId: id,
        summary: t(
          isActive ? "audit.summaries.contractorRestored" : "audit.summaries.contractorArchived",
          { name: target.name },
        ),
        changes: diffEntity(
          contractorAuditSnapshot({ ...values, isActive: target.isActive }, t, locale),
          contractorAuditSnapshot({ ...values, isActive }, t, locale),
        ),
      });
      return { ok: true };
    });

    if (result.ok) revalidatePath(CONTRACTORS_PATH, "layout");
    return result;
  },
);
