/**
 * The university grade scale.
 *
 * Hardcoded by decision, not configurable: three independent copies already agree
 * (result-sheet-gen/src/utils/gradeTable.js, reference/output demo.xls!L82:P92,
 * and the published PDF legend), and this is the scale a Controller of Examinations
 * signs against. Making it editable invites someone to "fix" it in a hurry.
 *
 * Provenance: result-sheet-gen/src/utils/gradeTable.js
 */
export const GRADE_BANDS = [
  { min: 80, gp: 4.0, lg: 'A+' },
  { min: 75, gp: 3.75, lg: 'A' },
  { min: 70, gp: 3.5, lg: 'A-' },
  { min: 65, gp: 3.25, lg: 'B+' },
  { min: 60, gp: 3.0, lg: 'B' },
  { min: 55, gp: 2.75, lg: 'B-' },
  { min: 50, gp: 2.5, lg: 'C+' },
  { min: 45, gp: 2.25, lg: 'C' },
  { min: 40, gp: 2.0, lg: 'D' },
  { min: 0, gp: 0, lg: 'F' },
];

/** Printed in the legend but never produced by a mark lookup. */
export const SPECIAL_LETTER_GRADES = ['I', 'W'];

export const FULL_MARKS = 100;

/** marks -> { gp, lg } or null when there is no mark at all. */
export function lookup(marks) {
  if (marks === null || marks === undefined || Number.isNaN(marks)) return null;
  for (const band of GRADE_BANDS) {
    if (marks >= band.min) return { gp: band.gp, lg: band.lg };
  }
  return null;
}

/**
 * The legend table printed under the student rows.
 *
 * Ascending (0 through 80), which is the order the department's workbooks use.
 * Shape matches them too: five columns wide with values in columns 1, 2 and 5.
 */
export function legendRows() {
  return [...GRADE_BANDS].reverse().map((band) => ({
    marks: band.min,
    gp: band.gp,
    lg: band.lg,
  }));
}