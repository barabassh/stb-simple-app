import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { findImportDefinition } from "@/features/import/definitions";
import { FORBIDDEN_PATH } from "@/lib/auth/constants";
import { requireUser } from "@/lib/auth/current-user";
import { IMPORT_FILE_EXTENSION } from "@/lib/import";
import { renderImportTemplate } from "@/lib/import/template";
import { can } from "@/lib/permissions";

/** The template of an import, built from the same columns the file is read by (docs/ТЗ.md, 7.13). */
export async function GET(request: NextRequest) {
  const viewer = await requireUser();
  const definition = findImportDefinition(request.nextUrl.searchParams.get("name"));
  if (!definition) return new Response(null, { status: 404 });
  // A link can be forwarded to anyone, so a user without access gets the page a section gives.
  if (!can(viewer, definition.permission)) redirect(FORBIDDEN_PATH);

  const file = await renderImportTemplate(await definition.texts());

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${definition.name}_template${IMPORT_FILE_EXTENSION}"`,
      "Cache-Control": "no-store",
    },
  });
}
