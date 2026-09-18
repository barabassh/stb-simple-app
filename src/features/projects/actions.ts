"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { diffEntity, logAudit } from "@/lib/audit";
import { authorizedAction } from "@/lib/auth/authorized-action";
import { db } from "@/lib/db";
import { getClientInfo } from "@/lib/request-info";

import { projectAuditSnapshot } from "./audit";
import { projectStoredValues } from "./form-values";
import { projectFormSelect, toFormRecord } from "./queries";
import { projectFormSchema, type ProjectFormValues } from "./schemas";

// A closed project is changed by nobody (docs/ПРАВА-ДОСТУПА.md, rule 10). The status is checked by
// the condition of the write itself, in the transaction of the audit entry: a project can be closed
// between reading it and saving the form.

const PROJECTS_PATH = "/projects";
// The card of a customer lists its projects.
const CUSTOMERS_PATH = "/customers";

const notFound: ActionFailure = { ok: false, error: "projects.errors.notFound" };
const closed: ActionFailure = { ok: false, error: "projects.errors.closed" };
const numberTaken: ActionFailure = {
  ok: false,
  fieldErrors: { number: ["projects.errors.numberTaken"] },
};
const customerArchived: ActionFailure = {
  ok: false,
  fieldErrors: { customerId: ["projects.errors.customerArchived"] },
};
const customerMissing: ActionFailure = {
  ok: false,
  fieldErrors: { customerId: ["projects.validation.customerRequired"] },
};

const projectIdSchema = z.cuid();

function validationFailure(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    (fieldErrors[issue.path.join(".")] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

function projectData(values: ProjectFormValues) {
  return {
    number: values.number,
    name: values.name,
    customerId: values.customerId,
    street: values.address.street,
    houseNumber: Number(values.address.houseNumber),
    houseNumberAddition: values.address.houseNumberAddition || null,
    postcode: values.address.postcode,
    city: values.address.city,
    country: values.address.country,
    startDate: new Date(`${values.startDate}T00:00:00Z`),
    description: values.description || null,
    // Exact decimal strings: Prisma writes them to the Decimal columns without a float between.
    budgetAmount: values.budgetAmount || null,
    vatRate: values.vatRate ?? null,
    budgetHours: values.budgetHours || null,
  };
}

/** Called once the input is valid: an invalid request is not worth reading the request for. */
async function auditContext() {
  const [t, locale, request] = await Promise.all([getTranslations(), getLocale(), getClientInfo()]);
  return { t, locale, request };
}

/**
 * The number is unique among projects that are not deleted, ignoring case, by a partial index
 * (docs/СХЕМА-БД.md, 9.3). A suggested number is not reserved, so two people creating projects
 * at once collide here, and the second one is told under the field rather than shown a failure.
 */
function uniqueViolation(error: unknown): ActionFailure | null {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    ? numberTaken
    : null;
}

/**
 * An archived customer cannot be chosen for a new project or when the customer changes; the
 * choice list is not the check (docs/ПРАВА-ДОСТУПА.md, rule 13).
 */
async function activeCustomerName(
  tx: Prisma.TransactionClient,
  customerId: string,
): Promise<string | ActionFailure> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { name: true, isActive: true },
  });
  if (!customer) return customerMissing;
  return customer.isActive ? customer.name : customerArchived;
}

async function saving<T extends ActionResult>(save: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    const result = await save();
    if (result.ok) {
      revalidatePath(PROJECTS_PATH, "layout");
      revalidatePath(CUSTOMERS_PATH, "layout");
    }
    return result;
  } catch (error) {
    const failure = uniqueViolation(error);
    if (failure) return failure;
    throw error;
  }
}

export const createProject = authorizedAction(
  "projects.create",
  async (actor, input: unknown): Promise<ActionResult<{ id: string }>> => {
    const parsed = projectFormSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;
    const { t, locale, request } = await auditContext();

    return saving(() =>
      db.$transaction(async (tx): Promise<ActionResult<{ id: string }>> => {
        const customerName = await activeCustomerName(tx, values.customerId);
        if (typeof customerName !== "string") return customerName;

        const { id } = await tx.project.create({
          data: { ...projectData(values), createdById: actor.id, updatedById: actor.id },
          select: { id: true },
        });
        await logAudit(tx, {
          ...request,
          actor,
          action: "CREATE",
          entity: "Project",
          entityId: id,
          summary: t("audit.summaries.projectCreated", {
            number: values.number,
            name: values.name,
          }),
          changes: diffEntity(null, {
            ...projectAuditSnapshot(values, customerName, t, locale),
            status: t("projects.statuses.IN_PROGRESS"),
          }),
        });
        return { ok: true, id };
      }),
    );
  },
);

export const updateProject = authorizedAction(
  "projects.update",
  async (actor, id: string, input: unknown): Promise<ActionResult> => {
    if (!projectIdSchema.safeParse(id).success) return notFound;
    const parsed = projectFormSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    const values = parsed.data;
    const { t, locale, request } = await auditContext();

    return saving(() =>
      db.$transaction(async (tx): Promise<ActionResult> => {
        const found = await tx.project.findFirst({
          where: { id, deletedAt: null },
          select: projectFormSelect,
        });
        if (!found) return notFound;
        const target = toFormRecord(found);

        // The same archived customer stays allowed: an old project is still edited.
        let customerName = target.customer.name;
        if (values.customerId !== target.customerId) {
          const name = await activeCustomerName(tx, values.customerId);
          if (typeof name !== "string") return name;
          customerName = name;
        }

        const changes = diffEntity(
          projectAuditSnapshot(projectStoredValues(target), target.customer.name, t, locale),
          projectAuditSnapshot(values, customerName, t, locale),
        );
        // An unchanged form writes nothing, so "Изменено" keeps pointing at the last real change;
        // a closed project still answers that it is closed.
        if (changes.length === 0) return target.status === "IN_PROGRESS" ? { ok: true } : closed;

        const { count } = await tx.project.updateMany({
          where: { id, status: "IN_PROGRESS", deletedAt: null },
          data: { ...projectData(values), updatedById: actor.id },
        });
        if (count === 0) return closed;

        await logAudit(tx, {
          ...request,
          actor,
          action: "UPDATE",
          entity: "Project",
          entityId: id,
          summary: t("audit.summaries.projectUpdated", {
            number: values.number,
            name: values.name,
          }),
          changes,
        });
        return { ok: true };
      }),
    );
  },
);
