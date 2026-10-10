import { IDENTITY_FIELDS, matchIdentityHeaders } from '../model/identityHeaders.js';
import { getXlsx, listSheets, readFile } from './workbook.js';
import { normalizeId } from '../utils/numbers.js';
import { ParseError, WARNINGS, warn } from '../utils/warnings.js';

const REG_WIDTH = 9;

const clean = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
};

/**
 * Parse the student-master file.
 *
 * The mark files carry an ID and nothing else, so this is where names,
 * registrations and sessions come from. It is also the roster: rows come from
 * here, not from the marks, so a student enrolled but absent from a mark file
 * still appears (and gets flagged) rather than vanishing from the transcript.
 */
export async function parseStudentMaster(file) {
  const label = file?.name ?? 'file';
  const XLSX = await getXlsx();
  const workbook = await readFile(file);
  const sheets = listSheets(XLSX, workbook);

  let chosen = null;
  for (const sheet of sheets) {
    const limit = Math.min(6, sheet.matrix.length);
    for (let r = 0; r < limit; r++) {
      const cols = matchIdentityHeaders(sheet.matrix[r] ?? []);
      if (cols.studentId !== undefined && cols.name !== undefined) {
        chosen = { sheet, headerRow: r, cols };
        break;
      }
    }
    if (chosen) break;
  }

  if (!chosen) {
    throw new ParseError(
      WARNINGS.NO_ID_COLUMN,
      `${label}: could not find an ID and Name column.`,
      `Expected one of: ${IDENTITY_FIELDS.studentId.join(', ')} / ${IDENTITY_FIELDS.name.join(', ')}. Sheets: ${sheets.map((s) => s.name).join(', ')}`,
    );
  }

  const warnings = [];
  const students = [];
  const seen = new Map();
  const duplicates = [];

  for (let r = chosen.headerRow + 1; r < chosen.sheet.matrix.length; r++) {
    const row = chosen.sheet.matrix[r];
    if (!row) continue;
    const id = normalizeId(row[chosen.cols.studentId]);
    if (id === null || Number(id) <= 0) continue;

    const reg = clean(row[chosen.cols.registration] ?? '').replace(/\D/g, '');
    const student = {
      id,
      name: clean(row[chosen.cols.name]),
      reg: reg ? String(Number(reg)).padStart(REG_WIDTH, '0') : '',
      session: clean(row[chosen.cols.session] ?? ''),
    };

    if (seen.has(id)) {
      duplicates.push(id);
      continue;
    }
    seen.set(id, students.length);
    students.push(student);
  }

  if (students.length === 0) {
    throw new ParseError(WARNINGS.NO_DATA, `${label}: the header row was found but no students followed it.`, null);
  }

  if (duplicates.length) {
    warnings.push(
      warn(
        WARNINGS.DUPLICATE_ID,
        `${label}: ${duplicates.length} repeated student ID${duplicates.length === 1 ? '' : 's'} (${duplicates.slice(0, 5).join(', ')}).`,
        'First occurrence kept.',
      ),
    );
  }

  const blankReg = students.filter((s) => !s.reg).length;
  if (blankReg) {
    warnings.push(
      warn(WARNINGS.MASTER_ONLY, `${label}: ${blankReg} student${blankReg === 1 ? ' has' : 's have'} no registration number.`, null),
    );
  }

  return {
    fileName: label,
    sheetName: chosen.sheet.name,
    students,
    byId: new Map(students.map((s) => [s.id, s])),
    count: students.length,
    warnings,
  };
}
