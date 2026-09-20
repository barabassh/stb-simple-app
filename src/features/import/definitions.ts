import { reportsImport } from "@/features/reports/import";
import type { ImportDefinition } from "@/lib/import";

// A section offers an import by describing it in its own import.ts and being listed here; stage 6
// adds the rest of the data to the list (docs/АРХИТЕКТУРА.md, 3.11).
const IMPORTS: readonly ImportDefinition[] = [reportsImport];

export function findImportDefinition(name: string | null | undefined): ImportDefinition | null {
  return IMPORTS.find((definition) => definition.name === name) ?? null;
}
