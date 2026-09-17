// The number a new project is offered (docs/ТЗ.md, 6.6). It is not reserved: two people creating
// projects at once get the same suggestion, and the second one is rejected by the unique index.

const NUMBER_OF_YEAR = /^(\d{4})-(\d+)$/;

const MIN_DIGITS = 3;

/**
 * `ГГГГ-NNN`: the highest number of the given year plus one, padded to three digits
 * (2026-001, …, 2026-999, 2026-1000). Numbers of other years and of other shapes are ignored;
 * deleted projects count as well, so their numbers are not offered again.
 */
export function nextProjectNumber(existingNumbers: Iterable<string>, year: number): string {
  let highest = 0;

  for (const number of existingNumbers) {
    const match = NUMBER_OF_YEAR.exec(number.trim());
    if (match && Number(match[1]) === year) {
      highest = Math.max(highest, Number(match[2]));
    }
  }

  return `${year}-${String(highest + 1).padStart(MIN_DIGITS, "0")}`;
}
