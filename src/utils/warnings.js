/** Warning codes. Stable strings so the UI and tests can key off them. */
export const WARNINGS = {
  TOTAL_MISMATCH: 'total-mismatch',
  TOTAL_DOUBLED: 'total-doubled',
  COURSE_DISAGREEMENT: 'course-disagreement',
  ROUTED_BY_CONTENT: 'routed-by-content',
  ROUTED_BY_NAME: 'routed-by-name',
  AMBIGUOUS_COURSE: 'ambiguous-course',
  UNROUTED: 'unrouted',
  SLOT_CONFLICT: 'slot-conflict',
  DUPLICATE_ID: 'duplicate-id',
  MASTER_ONLY: 'master-only',
  MARKS_ONLY: 'marks-only',
  COMPONENT_OUT_OF_RANGE: 'component-out-of-range',
  NO_ID_COLUMN: 'no-id-column',
  NO_DATA: 'no-data',
};

export function warn(code, message, detail) {
  return { code, message, detail };
}

/** An error the user must fix, as opposed to something we merely flag. */
export class ParseError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Compare a file's stated total against the sum of its own question columns.
 *
 * This is where the corpus's arithmetic bugs surface. `MIS 3206` totals with
 * `=SUM(C:G)` and drops question 6; `MIS 3103 Final.xlsx` carries a second
 * total column that is exactly double the real one. Neither is ever trusted --
 * but both must be visible, because a silent mismatch is a silent wrong mark.
 */
export function compareTotals(rows, fileLabel, warnings, tolerance = 0.011) {
  let mismatches = 0;
  let doubled = 0;
  let sample = null;

  for (const row of rows) {
    if (row.statedTotal === null) continue;
    const recomputed = row.recomputedTotal;
    if (Math.abs(row.statedTotal - recomputed) <= tolerance) continue;
    mismatches += 1;
    if (
      !sample &&
      Math.abs(row.statedTotal - recomputed * 2) <= tolerance &&
      recomputed > 0
    ) {
      doubled += 1;
      sample = { id: row.studentId, stated: row.statedTotal, recomputed };
    }
  }

  if (mismatches === 0) return;

  if (sample) {
    warnings.push(
      warn(
        WARNINGS.TOTAL_DOUBLED,
        `${fileLabel}: the file's Total column is exactly double the sum of its questions (${doubled} row${doubled === 1 ? '' : 's'}).`,
        `Example ${sample.id}: file says ${sample.stated}, questions sum to ${sample.recomputed}. Recomputed value used.`,
      ),
    );
    return;
  }

  warnings.push(
    warn(
      WARNINGS.TOTAL_MISMATCH,
      `${fileLabel}: stated totals disagree with the sum of the question marks on ${mismatches} row${mismatches === 1 ? '' : 's'}.`,
      `Example ${rows.find((r) => r.statedTotal !== null && Math.abs(r.statedTotal - r.recomputedTotal) > tolerance)?.studentId ?? ''}. Recomputed values used throughout.`,
    ),
  );
}