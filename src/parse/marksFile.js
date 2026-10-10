import { detectCourse } from './courseIdentity.js';
import { columnLabel } from './columns.js';
import { pickDataSheet } from './sheetPicker.js';
import { getXlsx, listSheets, readFile } from './workbook.js';
import { normalizeId, sum, toNumber } from '../utils/numbers.js';
import { ParseError, WARNINGS, compareTotals, warn } from '../utils/warnings.js';

/**
 * Parse a course mark file.
 *
 * The result is deliberately course-agnostic: it knows what a mark file looks
 * like, but NOT whether it is the continuous sheet or the 2nd setter's. Role is
 * assigned by the slot the file lands in, because the 1st- and 2nd-setter
 * workbooks are structurally identical -- same title block, same `1..6`
 * question headers, same `Total (60%)`. The only thing that distinguishes them
 * anywhere in the corpus is the word in the filename.
 */
export async function parseMarksFile(file) {
  const label = file?.name ?? 'file';
  const XLSX = await getXlsx();
  const workbook = await readFile(file);
  const sheets = listSheets(XLSX, workbook);

  const anyHeader = sheets.some((s) => s.matrix.some((r) => r?.length));
  if (!anyHeader) {
    throw new ParseError(WARNINGS.NO_DATA, `${label}: the workbook is empty.`, null);
  }

  const picked = pickDataSheet(sheets);
  if (!picked) {
    throw new ParseError(
      WARNINGS.NO_ID_COLUMN,
      `${label}: no sheet has a student-ID column, so this does not look like a marks file.`,
      `Sheets: ${sheets.map((s) => s.name).join(', ')}`,
    );
  }

  const warnings = [];
  const codes = detectCourse(
    { name: label },
    picked.matrix,
    picked.headerIndex,
  );

  // A total-only source (a viva) has no question marks to sum: its single
  // reported figure IS the mark. Reading it through `recomputedTotal` would
  // return 0 and silently fail every viva in the batch.
  const totalOnly = picked.marks.length === 0;

  const rows = picked.dataRows.map((row) => {
    const values = picked.marks.map((c) => toNumber(row[c]));
    const statedTotal =
      picked.totalCol !== null && picked.totalCol >= 0
        ? toNumber(row[picked.totalCol])
        : null;
    const recomputedTotal = sum(values);
    return {
      studentId: normalizeId(row[picked.idCol]),
      values,
      statedTotal,
      recomputedTotal,
      mark: totalOnly ? statedTotal : recomputedTotal,
    };
  });

  if (!totalOnly) compareTotals(rows, label, warnings);
  warnOnDuplicateTotal(picked, label, warnings);

  const seen = new Set();
  const duplicates = [];
  for (const row of rows) {
    if (seen.has(row.studentId)) duplicates.push(row.studentId);
    seen.add(row.studentId);
  }
  if (duplicates.length) {
    warnings.push(
      warn(
        WARNINGS.DUPLICATE_ID,
        `${label}: ${duplicates.length} repeated student ID${duplicates.length === 1 ? '' : 's'} (${duplicates.slice(0, 5).join(', ')}).`,
        'Later rows win.',
      ),
    );
  }

  // A file with no mark columns and no total is a mis-picked sheet, not a result.
  if (picked.marks.length === 0 && picked.totalCol === null) {
    throw new ParseError(
      WARNINGS.NO_DATA,
      `${label}: sheet "${picked.name}" has an ID column but no marks.`,
      null,
    );
  }

  return {
    id: fileKey(label),
    fileName: label,
    sheetName: picked.name,
    shape: picked.shape,
    filenameCode: codes.filenameCode,
    contentCode: codes.contentCode,
    studentIds: rows.map((r) => r.studentId),
    rows: rows.filter(
      (row, i) => rows.findIndex((r) => r.studentId === row.studentId) === i,
    ),
    marks: picked.marks.map((c, i) => ({
      index: i,
      label: columnLabel(picked.matrix, picked.headerIndex, c),
      max: null,
    })),
    totalOnly,
    count: rows.length,
    warnings,
  };
}

export function fileKey(name) {
  return `${name}`;
}

/**
 * Flag a shadow total sitting next to the real one.
 *
 * `MIS 3103 Final.xlsx` carries two total columns: the real one in column O, and
 * in column P a `=SUM(B:O)` that is exactly double it. We already pick the
 * column that adds up, so this costs us nothing -- but the department's own
 * workbook is wrong, and a user comparing their file against ours deserves to
 * know why the numbers differ.
 */
function warnOnDuplicateTotal(picked, label, warnings) {
  const shadow = picked.totalCol + 1;
  if (picked.totalCol === null || shadow <= picked.idCol) return;
  const dataRows = picked.dataRows;
  if (dataRows.length < 5) return;

  let present = 0;
  let doubled = 0;
  let sample = null;

  for (const row of dataRows) {
    const total = toNumber(row[picked.totalCol]);
    const next = toNumber(row[shadow]);
    if (total === null || next === null) continue;
    present += 1;
    if (total !== 0 && Math.abs(next - total * 2) < 0.011) {
      doubled += 1;
      if (!sample) sample = { id: normalizeId(row[picked.idCol]), total, next };
    }
  }

  if (present > 0 && doubled / present >= 0.8) {
    warnings.push(
      warn(
        WARNINGS.TOTAL_DOUBLED,
        `${label}: the column just after Total is exactly double it on ${doubled} of ${present} rows.`,
        `Example ${sample.id}: Total ${sample.total}, next column ${sample.next}. The correct total was used; the extra column looks like a broken SUM that counts the total twice.`,
      ),
    );
  }
}