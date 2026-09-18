type Translate = (key: string) => string;

/** "Активен" / "В архиве", as the audit log and the export write it (docs/ТЗ.md, 6.10). */
export const referenceStatusName = (isActive: boolean, t: Translate) =>
  t(isActive ? "referenceBooks.statuses.active" : "referenceBooks.statuses.archived");
