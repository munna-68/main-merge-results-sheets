import { isUsableId, sum, toNumber } from '../utils/numbers.js';

/**
 * Structural recognition of a marks sheet.
 *
 * Everything here is deliberately position-and-shape based. Filenames and sheet
 * names in this corpus are unreliable: `MIS 3103 Final.xlsx` is internally MIS
 * 3203, three files sit on a sheet named `MIS 3106`, the MBA thesis data sheet is
 * named `2202`, and one file's title block names the wrong department.
 */

/** Normalised aliases for an ID column header. */
const ID_ALIASES = new Set([
  'id',
  'idno',
  'idnumber',
  'idnum',
  'studentid',
  'studentidno',
  'studentidnumber',
  'roll',
  'rollno',
  'rollnumber',
]);

/** Bengali for "ID number" -- the header on the two Bengali-typed files. */
const BENGALI_ID = 'আইডি';
/** Bengali for "total". */
const BENGALI_TOTAL = 'মোট';
/** The mojibake form of "মোট" that several recovered files carry. */
const MOJIBAKE_TOTAL = '†gvU';

const TOTAL_RE = new RegExp(`total|${BENGALI_TOTAL}|${MOJIBAKE_TOTAL}`, 'i');

const normalize = (value) =>
  value === null || value === undefined
    ? ''
    : String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

/** True when this cell is an ID column header. Exact match, never a substring. */
export function isIdHeader(cell) {
  if (cell === null || cell === undefined) return false;
  const text = String(cell);
  if (text.includes(BENGALI_ID)) return true;
  return ID_ALIASES.has(normalize(text));
}

export function findIdColumn(row) {
  if (!row) return -1;
  for (let c = 0; c < row.length; c++) {
    if (isIdHeader(row[c])) return c;
  }
  return -1;
}

/**
 * The header row drifts between rows 4 and 9 across templates, so we scan.
 * Two files split the header across a title row and a sub-header row; only the
 * first of the pair carries the ID header, which is what we key off.
 */
export function locateHeaderRow(rows, maxScan = 15) {
  const limit = Math.min(maxScan, rows.length);
  for (let i = 0; i < limit; i++) {
    const idCol = findIdColumn(rows[i]);
    if (idCol >= 0) return { index: i, idCol };
  }
  return null;
}

/**
 * Data rows: the ones with a usable ID.
 *
 * This single test is what silently loses students to the two stacked-block
 * files if you forget it. Both repeat their title block and header mid-sheet
 * (`Id no` / `ID`), and both put date and signature rows at the bottom -- none
 * of which parse as a positive integer.
 */
export function dataRowsFrom(rows, headerIndex, idCol) {
  const out = [];
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !isUsableId(row[idCol])) continue;
    out.push(row);
  }
  return out;
}

function lastUsedColumn(dataRows) {
  let last = -1;
  for (const row of dataRows) {
    for (let c = row.length - 1; c > last; c--) {
      if (row[c] !== null && row[c] !== undefined && row[c] !== '') {
        last = c;
        break;
      }
    }
  }
  return last;
}

/** Leftmost explicit "total" header in the header row or the row beneath it. */
function explicitTotalColumn(rows, headerIndex) {
  for (let r = headerIndex; r <= Math.min(headerIndex + 1, rows.length - 1); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (typeof row[c] === 'string' && TOTAL_RE.test(row[c])) return c;
    }
  }
  return null;
}

const columnsBetween = (from, to) => {
  const out = [];
  for (let c = from + 1; c < to; c++) out.push(c);
  return out;
};

/**
 * Pick the total column and validate the choice against the data.
 *
 * Rather than trusting a header string, we require the candidate to actually
 * behave like a total -- equal to the sum of the columns before it on most
 * rows. That matters for `MIS 3103 Final.xlsx`, whose sheet carries BOTH a
 * real total (col O) and a second column that is exactly its double (col P,
 * `=SUM(B:O)`). Header text alone cannot separate them; the arithmetic can.
 */
function chooseTotalColumn(rows, headerIndex, idCol, dataRows) {
  if (dataRows.length === 0) return explicitTotalColumn(rows, headerIndex);
  const positional = lastUsedColumn(dataRows);
  const explicit = explicitTotalColumn(rows, headerIndex);
  const seen = new Set();
  const order = [explicit, positional].filter((c) => {
    if (c === null || c === undefined || c <= idCol || seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  for (const totalCol of order) {
    const marks = columnsBetween(idCol, totalCol).filter((c) =>
      dataRows.some((row) => toNumber(row[c]) !== null),
    );
    if (marks.length === 0) continue;
    let present = 0;
    let matching = 0;
    for (const row of dataRows) {
      const stated = toNumber(row[totalCol]);
      if (stated === null) continue;
      present += 1;
      if (Math.abs(stated - sum(marks.map((c) => toNumber(row[c])))) < 0.011) matching += 1;
    }
    if (present > 0 && matching / present >= 0.7) return totalCol;
  }
  return explicit ?? positional;
}

/**
 * Mark columns: strictly between the ID column and the total column, minus any
 * column that is blank for every single student.
 *
 * The all-blank filter is what removes `Q7` in `MIS 3201 Final` and `Q7`-`Q13`
 * in `MIS 3103 Final`. Treating those as real questions drags a student's total
 * downward and quietly costs them marks.
 */
export function profileColumns(rows, headerIndex, idCol) {
  const dataRows = dataRowsFrom(rows, headerIndex, idCol);
  const totalCol = chooseTotalColumn(rows, headerIndex, idCol, dataRows);
  const marks = columnsBetween(idCol, totalCol).filter((c) =>
    dataRows.some((row) => toNumber(row[c]) !== null),
  );
  return { dataRows, marks, totalCol, idCol, headerIndex };
}

/** Header text for a column, looking in the header row and the sub-header beneath. */
export function columnLabel(rows, headerIndex, colIndex) {
  for (let r = headerIndex; r <= Math.min(headerIndex + 1, rows.length - 1); r++) {
    const cell = rows[r]?.[colIndex];
    if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
      return String(cell).trim();
    }
  }
  return `Col ${colIndex + 1}`;
}

/**
 * Content classification, used only to warn and to auto-route.
 *
 * Order matters: continuous-assessment sheets carry a "Presentation (5%)" column
 * among their components, so a naive report check would call them thesis sheets.
 * Continuous is therefore tested first, and the report test asks for the words
 * that actually mean a report.
 */
export function classifyShape(rows, profile) {
  const labels = profile.marks.map((c) => columnLabel(rows, profile.headerIndex, c));
  const joined = labels.join(' ').toLowerCase();

  if (profile.marks.length === 0) return 'total-only';
  if (/attend|attendence|quiz|in-?course|class test|assignment|mid|semester|continuous|contineous/.test(joined)) {
    return 'continuous';
  }
  if (/thesis|research|project|internship|dissertation/.test(joined)) return 'report';
  return 'question';
}
