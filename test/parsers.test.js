import { describe, expect, it } from 'vitest';

import { getXlsx } from '../src/parse/workbook.js';
import { normalizeId, round, roundUp, sum, toNumber } from '../src/utils/numbers.js';
import { matchIdentityHeaders, normalizeHeader } from '../src/model/identityHeaders.js';
import { lookup, legendRows } from '../src/model/gradeScale.js';
import { parseMarksFile } from '../src/parse/marksFile.js';
import { parseStudentMaster } from '../src/parse/studentMaster.js';
import { WARNINGS } from '../src/utils/warnings.js';

const asFile = async (name, sheets) => new File([await buildWorkbook(sheets)], name);

async function buildWorkbook(sheets) {
  const XLSX = await getXlsx();
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out).buffer;
}

describe('number handling', () => {
  it('reads numbers, blanks and junk without conflating them', () => {
    expect(toNumber(5)).toBe(5);
    expect(toNumber('4.33')).toBe(4.33);
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber('12,222,002')).toBe(12222002);
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber('Absent')).toBeNull();
    expect(toNumber('N/A')).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });

  it('reads Bengali digits, which the recovered files use', () => {
    expect(toNumber('১২.৫')).toBe(12.5);
  });

  it('normalises ids across text and numeric cells', () => {
    expect(normalizeId('12222002')).toBe('12222002');
    expect(normalizeId(12222002)).toBe('12222002');
    expect(normalizeId(12222002.0)).toBe('12222002');
    expect(normalizeId(' 12222002 ')).toBe('12222002');
    expect(normalizeId('12222002.0')).toBe('12222002');
  });

  it('never invents an id out of a date stamp on a signature row', () => {
    expect(normalizeId('ZvwiL: 30/07/2026 (AbywôZ: 23-07-26)')).toBeNull();
    expect(normalizeId('Submitted on 2026-07-30')).toBeNull();
    expect(normalizeId('cix¶‡Ki ¯^v¶i:')).toBeNull();
    expect(normalizeId('ID')).toBeNull();
  });

  it('rounds up to the next whole mark without float drift', () => {
    expect(roundUp(82.51)).toBe(83);
    expect(roundUp(73)).toBe(73);
    // The classic: 46 + 13/13 + 13.5/13.5 can land just above 46.
    expect(roundUp(4.33 + 4.18 + 13 + 13.5 + (48.5 + 46.5) / 2)).toBe(83);
    expect(roundUp(88.25)).toBe(89);
  });

  it('rounds to two places half-up', () => {
    expect(round(3.916666, 2)).toBe(3.92);
    expect(round(3.914, 2)).toBe(3.91);
    expect(round(1.005, 2)).toBe(1.01);
  });

  it('treats blanks as zero when summing', () => {
    expect(sum([1.5, null, 2, undefined, ''])).toBe(3.5);
    expect(sum([null, null])).toBe(0);
    expect(sum([])).toBe(0);
  });
});

describe('header matching', () => {
  it('ignores case and punctuation', () => {
    expect(normalizeHeader('Reg. No')).toBe('regno');
    expect(normalizeHeader('Reg No')).toBe('regno');
    expect(normalizeHeader('STUDENT ID')).toBe('studentid');
    expect(normalizeHeader("Student's Name")).toBe('studentsname');
  });

  it('maps the real-world alias spellings onto fields', () => {
    const cols = matchIdentityHeaders(['SL', 'ID', 'Name', 'Reg No', 'Session']);
    expect(cols).toEqual({ studentId: 1, name: 2, registration: 3, session: 4 });
  });

  it('takes only the first column when one is duplicated', () => {
    const cols = matchIdentityHeaders(['ID', 'Name', 'Name', 'Student Id']);
    expect(cols.name).toBe(1);
    expect(cols.studentId).toBe(0);
  });
});

describe('grade scale', () => {
  it('matches the published band boundaries exactly', () => {
    const cases = [
      [100, 4, 'A+'],
      [80, 4, 'A+'],
      [79.99, 3.75, 'A'],
      [75, 3.75, 'A'],
      [70, 3.5, 'A-'],
      [65, 3.25, 'B+'],
      [60, 3, 'B'],
      [55, 2.75, 'B-'],
      [50, 2.5, 'C+'],
      [45, 2.25, 'C'],
      [40, 2, 'D'],
      [39.99, 0, 'F'],
      [0, 0, 'F'],
    ];
    for (const [marks, gp, lg] of cases) {
      expect(lookup(marks)).toEqual({ gp, lg });
    }
  });

  it('lists the legend ascending, as the workbooks print it', () => {
    const rows = legendRows();
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ marks: 0, gp: 0, lg: 'F' });
    expect(rows.at(-1)).toEqual({ marks: 80, gp: 4, lg: 'A+' });
  });

  it('has no grade for a missing mark', () => {
    expect(lookup(null)).toBeNull();
    expect(lookup(undefined)).toBeNull();
  });
});

describe('parser traps', () => {
  const ids = ['12222002', '12222003', '12222005'];

  it('drops question columns that are blank for every student', async () => {
    const file = await asFile('MIS 3299 1st setter.xlsx', {
      Marks: [
        ['ID', 'Q1', 'Q2', 'Q3', 'Q4', 'Total (60%)'],
        ['12222002', 10, null, 12, 10, 32],
        ['12222003', 11, null, 11, 10, 32],
        ['12222005', 12, null, 13, 10, 35],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.marks).toHaveLength(3);
    expect(parsed.rows[0].recomputedTotal).toBe(32);
  });

  it('keeps a question column that only one student answered', async () => {
    // Dropping it would silently cost that student 8 marks.
    const file = await asFile('MIS 3299 1st setter.xlsx', {
      Marks: [
        ['ID', 'Q1', 'Q2', 'Total (60%)'],
        ['12222002', 10, 8, 18],
        ['12222003', 11, null, 11],
        ['12222005', 12, null, 12],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.marks).toHaveLength(2);
    expect(parsed.rows[0].recomputedTotal).toBe(18);
  });

  it('reads two stacked data blocks as one roster', async () => {
    const block = (list) => [
      ['ID', '1', '2', 'Total (60%)'],
      ...list.map(([id, a, b, t]) => [id, a, b, t]),
    ];
    const file = await asFile('MIS 3299 1st Continous.xls.xlsx', {
      Sheet1: [
        ['Department of Management Information Systems'],
        ...block([
          ['12222002', 10, 10, 20],
          ['12222003', 11, 11, 22],
        ]),
        ['Date: 30/07/2026'],
        ['Department of Management Information Systems'],
        ...block([
          ['12222005', 12, 12, 24],
          ['12222007', 13, 13, 26],
        ]),
        ['Signed by the Chairman'],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.count).toBe(4);
    expect(parsed.studentIds).toEqual(['12222002', '12222003', '12222005', '12222007']);
  });

  it('ignores the stray course-credit sheet', async () => {
    const file = await asFile('MIS 3299.xlsx', {
      '2202': [
        ['Course Code: MIS 3299'],
        ['SL NO', 'ID', '1', '2', 'Total (60%)'],
        ['1', '12222002', 10, 10, 20],
      ],
      Sheet1: [
        ['Course Code', 'Course Title', 'Course Type', 'Credit'],
        ['MIS 1101', 'Introduction to Business', 'Theory', 3],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.sheetName).toBe('2202');
    expect(parsed.contentCode).toBe('3299');
  });

  it('picks the richer sheet when a file has two data sheets', async () => {
    const file = await asFile('MIS 3299.xlsx', {
      Full: [
        ['SL NO', 'ID', '1', '2', '3', '4', 'Total (60%)'],
        ['1', '12222002', 5, 5, 5, 5, 20],
      ],
      Partial: [['SL NO', 'ID', '2nd Mid-Semester (15%)'], ['1', '12222002', 5]],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.sheetName).toBe('Full');
    expect(parsed.marks).toHaveLength(4);
  });

  it('finds a header row that has drifted down the sheet', async () => {
    const pad = Array.from({ length: 11 }, (_, i) => [`Line ${i}`]);
    const file = await asFile('MIS 3299.xlsx', {
      Marks: [
        ...pad,
        ['SL NO', 'ID', '1', '2', 'Total (60%)'],
        ['1', '12222002', 10, 10, 20],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.count).toBe(1);
    expect(parsed.rows[0].recomputedTotal).toBe(20);
  });

  it('reports a stated total that disagrees with the questions', async () => {
    const file = await asFile('MIS 3299.xlsx', {
      Marks: [
        ['SL NO', 'ID', '1', '2', 'Total (60%)'],
        ['1', '12222002', 10, 10, 25],
        ['2', '12222003', 11, 11, 27],
        ['3', '12222005', 12, 12, 29],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.warnings.map((w) => w.code)).toContain(WARNINGS.TOTAL_MISMATCH);
    expect(parsed.rows[0].recomputedTotal).toBe(20);
  });

  it('rejects a workbook with no ID column rather than guessing', async () => {
    const file = await asFile('notes.xlsx', {
      Sheet1: [['Course Code', 'Title', 'Credit'], ['MIS 1101', 'Business', 3]],
    });
    await expect(parseMarksFile(file)).rejects.toMatchObject({
      code: WARNINGS.NO_ID_COLUMN,
    });
  });

  it('reports repeated student ids in one file', async () => {
    const file = await asFile('MIS 3299.xlsx', {
      Marks: [
        ['SL NO', 'ID', '1', '2', 'Total (60%)'],
        ['1', '12222002', 10, 10, 20],
        ['2', '12222002', 11, 11, 22],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.warnings.map((w) => w.code)).toContain(WARNINGS.DUPLICATE_ID);
    expect(parsed.rows).toHaveLength(1);
  });

  it('reads Bengali id headers', async () => {
    const file = await asFile('MIS 3299.xlsx', {
      Marks: [
        ['ক্রমিক নং', 'আইডি নম্বর', '১', '২', 'মোট (৬০%)'],
        [1, '12222002', 10, 10, 20],
        [2, '12222003', 12, 12, 24],
      ],
    });
    const parsed = await parseMarksFile(file);
    expect(parsed.count).toBe(2);
    expect(parsed.rows[0].recomputedTotal).toBe(20);
  });

  void ids;
});

describe('student master', () => {
  it('reads identities and zero-pads the registration', async () => {
    const file = await asFile('students.xlsx', {
      Students: [
        ['SL', 'ID', 'Name', 'Reg No', 'Session'],
        [1, 12222002, 'AHONA TALUKDER', '18177', '2022-2023'],
        [2, '12222003', 'S. M. NADIA JAMAN', '18178', '2022-2023'],
      ],
    });
    const master = await parseStudentMaster(file);
    expect(master.count).toBe(2);
    expect(master.students[0]).toEqual({
      id: '12222002',
      name: 'AHONA TALUKDER',
      reg: '000018177',
      session: '2022-2023',
    });
  });

  it('ignores unknown extra columns without warning', async () => {
    const file = await asFile('students.xlsx', {
      Students: [
        ['ID', 'Name', 'Reg', 'Session', 'Blood Group', 'CGPA'],
        [12222002, 'AHONA TALUKDER', '18177', '2022-2023', 'A+', 3.92],
      ],
    });
    const master = await parseStudentMaster(file);
    expect(master.warnings).toHaveLength(0);
    expect(master.count).toBe(1);
  });

  it('refuses a marks file offered as the student master', async () => {
    const file = await asFile('setter.xlsx', {
      Marks: [
        ['SL NO', 'ID', '1', '2', 'Total (60%)'],
        ['1', '12222002', 10, 10, 20],
      ],
    });
    await expect(parseStudentMaster(file)).rejects.toMatchObject({
      code: WARNINGS.NO_ID_COLUMN,
    });
  });
});