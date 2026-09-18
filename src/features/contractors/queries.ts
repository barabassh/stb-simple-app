import type { SortOrder } from "@/components/data-table/search-params";
import { referenceWhere } from "@/components/reference-book/list-params";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

import type { ContractorSortColumn, ContractorsListParams } from "./list-params";

// Pages check the permission themselves to show the access denied page; the checks here keep
// a page that forgets it from showing the data anyway.

const listItemSelect = {
  id: true,
  name: true,
  kvkNumber: true,
  contactPerson: true,
  phone: true,
  email: true,
  city: true,
  isActive: true,
} as const satisfies Prisma.ContractorSelect;

export type ContractorListItem = Prisma.ContractorGetPayload<{ select: typeof listItemSelect }>;

const detailsSelect = {
  ...listItemSelect,
  legalForm: true,
  vatId: true,
  street: true,
  houseNumber: true,
  houseNumberAddition: true,
  postcode: true,
  country: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { fullName: true, login: true } },
  updatedBy: { select: { fullName: true, login: true } },
} as const satisfies Prisma.ContractorSelect;

export type ContractorDetails = Prisma.ContractorGetPayload<{ select: typeof detailsSelect }>;

const ORDER_BY: Record<
  ContractorSortColumn,
  (order: SortOrder) => Prisma.ContractorOrderByWithRelationInput
> = {
  name: (order) => ({ name: order }),
  kvkNumber: (order) => ({ kvkNumber: { sort: order, nulls: "last" } }),
  contactPerson: (order) => ({ contactPerson: { sort: order, nulls: "last" } }),
  phone: (order) => ({ phone: { sort: order, nulls: "last" } }),
  email: (order) => ({ email: { sort: order, nulls: "last" } }),
  city: (order) => ({ city: { sort: order, nulls: "last" } }),
  isActive: (order) => ({ isActive: order }),
};

function contractorsWhere(params: ContractorsListParams): Prisma.ContractorWhereInput {
  return referenceWhere(params, ["name", "kvkNumber", "contactPerson", "email"]);
}

function contractorsOrderBy({
  sort,
}: ContractorsListParams["table"]): Prisma.ContractorOrderByWithRelationInput[] {
  // The id tie-breaker keeps rows with equal sort values from moving between pages.
  return [...(sort ? [ORDER_BY[sort.column](sort.order)] : []), { id: "asc" }];
}

export async function listContractors(
  actor: SessionUser,
  params: ContractorsListParams,
): Promise<{ rows: ContractorListItem[]; rowCount: number }> {
  requirePermission(actor, "contractors.read");

  const where = contractorsWhere(params);
  const [rows, rowCount] = await Promise.all([
    db.contractor.findMany({
      where,
      select: listItemSelect,
      orderBy: contractorsOrderBy(params.table),
      skip: (params.table.page - 1) * params.table.pageSize,
      take: params.table.pageSize,
    }),
    db.contractor.count({ where }),
  ]);

  return { rows, rowCount };
}

/** Every contractor the registry shows with these parameters, in its order, on all of its pages. */
export async function listContractorsForExport(
  actor: SessionUser,
  params: ContractorsListParams,
): Promise<ContractorListItem[]> {
  requirePermission(actor, "contractors.export");

  return db.contractor.findMany({
    where: contractorsWhere(params),
    select: listItemSelect,
    orderBy: contractorsOrderBy(params.table),
  });
}

export async function getContractor(
  actor: SessionUser,
  id: string,
): Promise<ContractorDetails | null> {
  requirePermission(actor, "contractors.read");

  return db.contractor.findUnique({ where: { id }, select: detailsSelect });
}

export type ContractorOption = { id: string; name: string; isActive: boolean };

/**
 * The contractors the user form offers as the organisation (docs/АРХИТЕКТУРА.md, 3.8): the active
 * ones, plus the one the account is already linked to even if it has since been archived.
 */
export async function listContractorOptions(
  actor: SessionUser,
  selectedId?: string | null,
): Promise<ContractorOption[]> {
  requirePermission(actor, "users.changeContractor");

  return db.contractor.findMany({
    where: { OR: [{ isActive: true }, ...(selectedId ? [{ id: selectedId }] : [])] },
    select: { id: true, name: true, isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}
