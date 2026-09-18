// Overlapping reports of one worker on one day, the rule the WorkReport_no_overlap constraint
// enforces on write (docs/ТЗ.md, 7.6). This copy only serves the import preview, where the rows
// of a file are checked against each other and against the reports already made, before
// anything is written.

export type ReportInterval = {
  userId: string;
  /** `yyyy-MM-dd`. */
  workDate: string;
  startMinute: number;
  endMinute: number;
};

/** Half-open intervals [start, end): reports that meet at 12:00 do not overlap. */
export function intervalsOverlap(a: ReportInterval, b: ReportInterval): boolean {
  return (
    a.userId === b.userId &&
    a.workDate === b.workDate &&
    a.startMinute < b.endMinute &&
    b.startMinute < a.endMinute
  );
}

export type RowOverlaps<Existing> = {
  /** Indexes of the other rows this row overlaps, in order. */
  rows: number[];
  existing: Existing[];
};

/** For every row, in the same order: the other rows and the existing reports it overlaps. */
export function findOverlaps<Row extends ReportInterval, Existing extends ReportInterval>(
  rows: readonly Row[],
  existing: readonly Existing[],
): RowOverlaps<Existing>[] {
  const dayKey = ({ userId, workDate }: ReportInterval) => `${userId}|${workDate}`;

  const rowsByDay = Map.groupBy(rows.keys(), (index) => dayKey(rows[index]));
  const existingByDay = Map.groupBy(existing, dayKey);

  return rows.map((row, index) => {
    const key = dayKey(row);
    return {
      rows: (rowsByDay.get(key) ?? []).filter(
        (other) => other !== index && intervalsOverlap(row, rows[other]),
      ),
      existing: (existingByDay.get(key) ?? []).filter((report) => intervalsOverlap(row, report)),
    };
  });
}
