import { z } from "zod";

import { db } from "@/lib/db";

// A user's own display settings of tables (docs/СХЕМА-БД.md, 10.2). Not accounting data: there
// is no audit entry, and the User row is not touched, so hiding a column does not change when the
// account was last updated. Called by the actions and queries of the feature whose table it is,
// which check the permissions: this module is not a server action and cannot be called from a page.

export const PREFERENCE_TABLES = ["reports"] as const;
/**
 * A table on screen, or the columns of an export ("export:users"): the columns the user left out
 * of the file last time, and their order, are kept when the export dialog opens again
 * (docs/ТЗ.md, 4.11).
 */
export type PreferenceTable = (typeof PREFERENCE_TABLES)[number] | `export:${string}`;

export const exportPreference = (report: string): PreferenceTable => `export:${report}`;

export type TableSettings = {
  hiddenColumns: string[];
  /** Widths in pixels the user dragged columns to; columns left out keep their default width. */
  columnSizes: Record<string, number>;
  /** The order the user put the columns in; columns left out keep theirs, after these. */
  columnOrder: string[];
};

// Each setting is read on its own, so a damaged one does not take the other with it.
const hiddenColumnsSchema = z.array(z.string());
const columnSizesSchema = z.record(z.string(), z.number().int().positive());
const columnOrderSchema = z.array(z.string());

/** The settings of one table; anything unreadable stored there counts as not set. */
export async function readTableSettings(
  userId: string,
  table: PreferenceTable,
): Promise<TableSettings> {
  const row = await db.userPreference.findUnique({ where: { userId }, select: { tables: true } });
  const tables = row?.tables;
  const stored =
    tables && typeof tables === "object" && !Array.isArray(tables) ? tables[table] : undefined;
  const settings = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};

  const hidden = hiddenColumnsSchema.safeParse(settings.hiddenColumns);
  const sizes = columnSizesSchema.safeParse(settings.columnSizes);
  const order = columnOrderSchema.safeParse(settings.columnOrder);
  return {
    hiddenColumns: hidden.success ? hidden.data : [],
    columnSizes: sizes.success ? sizes.data : {},
    columnOrder: order.success ? order.data : [],
  };
}

/** Replaces the given settings of one table, keeping its other settings and the other tables'. */
export async function writeTableSettings(
  userId: string,
  table: PreferenceTable,
  changes: Partial<TableSettings>,
): Promise<void> {
  const patch = JSON.stringify(changes);
  // One statement, so two tabs saving different settings do not overwrite each other.
  await db.$executeRaw`
    INSERT INTO "UserPreference" ("userId", "tables", "updatedAt")
    VALUES (${userId}, jsonb_build_object(${table}::text, ${patch}::jsonb), now())
    ON CONFLICT ("userId") DO UPDATE
    SET "tables" = "UserPreference"."tables" || jsonb_build_object(
          ${table}::text,
          CASE WHEN jsonb_typeof("UserPreference"."tables" -> ${table}::text) = 'object'
               THEN "UserPreference"."tables" -> ${table}::text
               ELSE '{}'::jsonb END || ${patch}::jsonb
        ),
        "updatedAt" = now()`;
}
