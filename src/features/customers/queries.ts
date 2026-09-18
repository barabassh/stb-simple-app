import type { SortOrder } from "@/components/data-table/search-params";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

import type { CustomerSortColumn, CustomersListParams } from "./list-params";

// Pages check the permission themselves to show the access denied page; the checks here keep
// a page that forgets it from showing the data anyway.

const listItemSelect = {
  id: true,
  name: true,
  type: true,
  kvkNumber: true,
  contactPerson: true,
  phone: true,
  email: true,
  city: true,
  isActive: true,
} as const satisfies Prisma.CustomerSelect;

export type CustomerListItem = Prisma.CustomerGetPayload<{ select: typeof listItemSelect }>;

const detailsSelect = {
  ...listItemSelect,
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
} as const satisfies Prisma.CustomerSelect;

export type CustomerDetails = Prisma.CustomerGetPayload<{ select: typeof detailsSelect }>;

const ORDER_BY: Record<
  CustomerSortColumn,
  (order: SortOrder) => Prisma.CustomerOrderByWithRelationInput
> = {
  name: (order) => ({ name: order }),
  type: (order) => ({ type: order }),
  kvkNumber: (order) => ({ kvkNumber: { sort: order, nulls: "last" } }),
  contactPerson: (order) => ({ contactPerson: { sort: order, nulls: "last" } }),
  phone: (order) => ({ phone: { sort: order, nulls: "last" } }),
  email: (order) => ({ email: { sort: order, nulls: "last" } }),
  city: (order) => ({ city: { sort: order, nulls: "last" } }),
  isActive: (order) => ({ isActive: order }),
};

function customersWhere({ query, type, status }: CustomersListParams): Prisma.CustomerWhereInput {
  return {
    ...(type ? { type } : {}),
    ...(status !== "all" ? { isActive: status === "active" } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { kvkNumber: { contains: query, mode: "insensitive" } },
            { contactPerson: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

function customersOrderBy({
  sort,
}: CustomersListParams["table"]): Prisma.CustomerOrderByWithRelationInput[] {
  // The id tie-breaker keeps rows with equal sort values from moving between pages.
  return [...(sort ? [ORDER_BY[sort.column](sort.order)] : []), { id: "asc" }];
}

export async function listCustomers(
  actor: SessionUser,
  params: CustomersListParams,
): Promise<{ rows: CustomerListItem[]; rowCount: number }> {
  requirePermission(actor, "customers.read");

  const where = customersWhere(params);
  const [rows, rowCount] = await Promise.all([
    db.customer.findMany({
      where,
      select: listItemSelect,
      orderBy: customersOrderBy(params.table),
      skip: (params.table.page - 1) * params.table.pageSize,
      take: params.table.pageSize,
    }),
    db.customer.count({ where }),
  ]);

  return { rows, rowCount };
}

/** Every customer the registry shows with these parameters, in its order, on all of its pages. */
export async function listCustomersForExport(
  actor: SessionUser,
  params: CustomersListParams,
): Promise<CustomerListItem[]> {
  requirePermission(actor, "customers.export");

  return db.customer.findMany({
    where: customersWhere(params),
    select: listItemSelect,
    orderBy: customersOrderBy(params.table),
  });
}

export async function getCustomer(actor: SessionUser, id: string): Promise<CustomerDetails | null> {
  requirePermission(actor, "customers.read");

  return db.customer.findUnique({ where: { id }, select: detailsSelect });
}

export type CustomerOption = { id: string; name: string; isActive: boolean };

/**
 * The customers the project form offers (docs/АРХИТЕКТУРА.md, 3.8): the active ones, plus the
 * customer already chosen in the project being edited even if it has since been archived.
 */
export async function listCustomerOptions(
  actor: SessionUser,
  selectedId?: string | null,
): Promise<CustomerOption[]> {
  requirePermission(actor, "customers.read");

  const customers = await db.customer.findMany({
    where: { OR: [{ isActive: true }, ...(selectedId ? [{ id: selectedId }] : [])] },
    select: { id: true, name: true, isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  return customers;
}
