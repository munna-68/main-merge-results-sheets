/**
 * Header matching for the student-master file.
 *
 * Matching is case- and punctuation-insensitive: lowercase, then strip every
 * character that is not a-z0-9. So `Reg. No`, `Reg No`, `reg  no` and `RegNo`
 * all collapse to `regno`.
 *
 * Provenance: result-sheet-gen/src/utils/excelParser.js
 */
export const IDENTITY_FIELDS = {
  studentId: ['ID', 'Student ID', 'Student Id', 'Student ID '],
  name: ["Name", "Student's Name", 'Student Name', 'Name of Student'],
  registration: [
    'Reg',
    'Reg.',
    'Reg No',
    'Reg. No',
    'Registration',
    'Reg No.',
    'Regn',
    'Registration No',
    'Registration Number',
    'Registration No.',
  ],
  session: ['Session', 'Academic Session', 'Session '],
};

/** Columns that are known and intentionally ignored. Anything else unknown is silent. */
export const IGNORED_IDENTITY_HEADERS = new Set([
  'sl',
  'slno',
  'serial',
  'serialno',
  'cgpa',
  'sgpa',
]);

/** Lowercase and strip everything that is not an alphanumeric ASCII character. */
export function normalizeHeader(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Normalised alias list for one field, e.g. { regno: true, registration: true, ... } */
function aliasSet(field) {
  const set = new Set();
  for (const alias of IDENTITY_FIELDS[field] ?? []) {
    set.add(normalizeHeader(alias));
  }
  return set;
}

const ALIASES = Object.fromEntries(
  Object.keys(IDENTITY_FIELDS).map((field) => [field, aliasSet(field)]),
);

/**
 * Map a header row to field -> column index.
 * Only the FIRST matching column per field is used, so a duplicate is ignored
 * rather than silently overwriting.
 */
export function matchIdentityHeaders(headerRow) {
  const found = {};
  headerRow.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    if (!key) return;
    for (const field of Object.keys(ALIASES)) {
      if (found[field] === undefined && ALIASES[field].has(key)) {
        found[field] = index;
      }
    }
  });
  return found;
}

/** True when the header row looks like a student-master file rather than a marks file. */
export function looksLikeIdentityHeader(headerRow) {
  const match = matchIdentityHeaders(headerRow);
  return match.studentId !== undefined && match.name !== undefined;
}