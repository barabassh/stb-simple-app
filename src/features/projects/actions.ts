"use server";

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import type { ProjectStatus } from "@/generated/prisma/enums";
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

function revalidateProjects() {
  revalidatePath(PROJECTS_PATH, "layout");
  revalidatePath(CUSTOMERS_PATH, "layout");
}

async function saving<T extends ActionResult>(save: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    const result = await save();
    if (result.ok) revalidateProjects();
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

const statusChanged: ActionFailure = { ok: false, error: "projects.errors.statusChanged" };

const projectStatusSchema = z.enum(["IN_PROGRESS", "CLOSED"]);

/**
 * Nothing was written by a conditional update: tells a project that is gone from one whose status
 * has moved on. The read comes after the write and decides only the message.
 */
async function unchangedProject(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<{ status: ProjectStatus } | null> {
  return tx.project.findFirst({ where: { id, deletedAt: null }, select: { status: true } });
}

/**
 * Closes a project in progress or brings a closed one back (docs/ТЗ.md, 6.7). The expected current
 * status is the condition of the write: a second tab closing the same project writes nothing.
 */
export const changeProjectStatus = authorizedAction(
  "projects.changeStatus",
  async (actor, id: string, target: ProjectStatus): Promise<ActionResult> => {
    if (!projectIdSchema.safeParse(id).success) return notFound;
    const parsedTarget = projectStatusSchema.safeParse(target);
    if (!parsedTarget.success) return { ok: false, error: "errors.invalidRequest" };
    const closing = parsedTarget.data === "CLOSED";
    const { t, request } = await auditContext();

    const result = await db.$transaction(async (tx): Promise<ActionResult> => {
      const { count } = await tx.project.updateMany({
        where: { id, deletedAt: null, status: closing ? "IN_PROGRESS" : "CLOSED" },
        data: {
          status: parsedTarget.data,
          closedAt: closing ? new Date() : null,
          closedById: closing ? actor.id : null,
          updatedById: actor.id,
        },
      });
      if (count === 0) return (await unchangedProject(tx, id)) ? statusChanged : notFound;

      const { number } = await tx.project.findUniqueOrThrow({
        where: { id },
        select: { number: true },
      });
      const statusName = (status: ProjectStatus) => t(`projects.statuses.${status}`);
      await logAudit(tx, {
        ...request,
        actor,
        action: "STATUS_CHANGE",
        entity: "Project",
        entityId: id,
        summary: t(`audit.summaries.${closing ? "projectClosed" : "projectReopened"}`, { number }),
        changes: [
          {
            field: "status",
            before: statusName(closing ? "IN_PROGRESS" : "CLOSED"),
            after: statusName(parsedTarget.data),
          },
        ],
      });
      return { ok: true };
    });

    if (result.ok) revalidateProjects();
    return result;
  },
);

/**
 * A project made by mistake is deleted softly, and only while in progress (docs/ТЗ.md, 6.7): the
 * condition is part of the write, like every change of a project. The number becomes free, since
 * the unique index covers only projects that are not deleted.
 */
export const deleteProject = authorizedAction(
  "projects.delete",
  async (actor, id: string): Promise<ActionResult> => {
    if (!projectIdSchema.safeParse(id).success) return notFound;
    const { t, request } = await auditContext();

    const result = await db.$transaction(async (tx): Promise<ActionResult> => {
      const { count } = await tx.project.updateMany({
        where: { id, deletedAt: null, status: "IN_PROGRESS" },
        data: { deletedAt: new Date(), updatedById: actor.id },
      });
      if (count === 0) return (await unchangedProject(tx, id)) ? closed : notFound;

      const { number } = await tx.project.findUniqueOrThrow({
        where: { id },
        select: { number: true },
      });
      await logAudit(tx, {
        ...request,
        actor,
        action: "DELETE",
        entity: "Project",
        entityId: id,
        summary: t("audit.summaries.projectDeleted", { number }),
      });
      return { ok: true };
    });

    if (result.ok) revalidateProjects();
    return result;
  },
);
