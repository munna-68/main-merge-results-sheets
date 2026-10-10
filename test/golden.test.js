import { describe, expect, it } from 'vitest';

import { BATCH_3_2, FILES_3_2, goldenPath, inputPath } from './fixtures/batch-3-2.js';
import { normalizeId, readMatrix, runBatch } from './helpers.js';
import { round } from '../src/utils/numbers.js';
import { WARNINGS } from '../src/utils/warnings.js';

const GOLDEN = '3,2 Result-2025 (2022-2023) Detailed sheet.xls';

/**
 * Cells where the app deliberately does NOT reproduce the reference workbook.
 *
 * Keyed by `${studentId}|${headerName}`, with `*` meaning every student, so an
 * allowlist can never quietly absorb a regression somewhere else.
 */
const EXPECTED_DEVIATIONS = new Map([
  [
    '*|SL No',
    'Rows are sorted by Student Id here; the reference appends four earlier-session students at the end. Values are compared by Student Id, not by position.',
  ],
  [
    '12222062|Session',
    'The .xls says 2021-2022; the published transcript says 2022-2023. We follow the transcript.',
  ],
]);

const isExpected = (studentId, headerName) =>
  EXPECTED_DEVIATIONS.has(`${studentId}|${headerName}`) ||
  EXPECTED_DEVIATIONS.has(`*|${headerName}`);

const closeEnough = (a, b) => Math.abs(a - b) < 1e-6;

describe('golden: 3rd Year 2nd Semester, BBA', () => {
  let run;
  let goldenRows;
  let goldenHeader;

  const load = async () => {
    run = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    goldenRows = await readMatrix(goldenPath(GOLDEN), 'Main');
    goldenHeader = goldenRows[0].slice(0, goldenRows[0].findLastIndex((c) => c !== null && c !== '') + 1);
  };

  it('routes all 18 course files into their slots with no gaps', async () => {
    await load();
    expect(run.unrouted).toEqual([]);
    expect(run.missing).toEqual([]);
    expect(run.assignments.size).toBe(18);
  });

  it('reads every fixture file in full, including the stacked-block ones', async () => {
    await load();
    const stacked = run.parsed.find((p) => p.fileName === 'MIS 3203 1st Continous.xls');
    const doubled = run.parsed.find((p) => p.fileName === 'MIS 3103 Final.xlsx');

    // 37 + 16 across two header blocks. A single-block reader silently drops 16.
    expect(stacked.count).toBe(53);

    // The doubled file is 33 + 20 across two blocks. Of its 13 question columns
    // only 6 hold any mark at all; the rest are blank for every student, or hold
    // a single stray entry, and are correctly excluded from the total.
    expect(doubled.count).toBe(53);
    expect(doubled.marks.length).toBeLessThanOrEqual(6);
  });

  it('surfaces the arithmetic defects instead of absorbing them', async () => {
    await load();
    const codes = run.routingWarnings.map((w) => w.code);
    expect(codes).toContain(WARNINGS.COURSE_DISAGREEMENT);

    // The doubled-total file is reported rather than silently halved or doubled.
    const doubled = run.parsed.find((p) => p.fileName === 'MIS 3103 Final.xlsx');
    expect(doubled.warnings.map((w) => w.code)).toContain(WARNINGS.TOTAL_DOUBLED);

    // Both MIS 3206 setter files total with SUM(C:G), omitting question 6.
    // That question is blank for every student, so the omission is harmless --
    // what matters is that the app excluded the empty column and that the
    // stated total still reconciles against the recomputed one.
    for (const name of ['MIS 3206 1st setter.xls', 'MIS 3206 2nd setter.xlsx']) {
      const file = run.parsed.find((p) => p.fileName === name);
      expect(file.marks.length).toBe(5);
      expect(file.warnings.filter((w) => w.code === WARNINGS.TOTAL_MISMATCH)).toHaveLength(0);
      for (const row of file.rows) {
        expect(row.statedTotal).toBeCloseTo(row.recomputedTotal, 9);
      }
    }
  });

  it('picks the correct total column out of the doubled pair', async () => {
    await load();
    // Column P is `=SUM(B:O)`, i.e. exactly twice the real total in column O.
    // We select O, so the stated and recomputed totals agree and the shadow
    // column is reported rather than used.
    const doubled = run.parsed.find((p) => p.fileName === 'MIS 3103 Final.xlsx');
    expect(doubled.rows[0].statedTotal).toBe(57);
    expect(doubled.rows[0].recomputedTotal).toBe(57);
    expect(doubled.rows[0].statedTotal).not.toBe(114);
  });

  it('reproduces the reference workbook cell for cell', async () => {
    await load();
    const { header, rows } = run.model;

    expect(header).toHaveLength(goldenHeader.length);
    expect(rows).toHaveLength(53);

    // Our suffixes carry real course codes; the reference uses ordinals.
    // Layout is identical, so columns are compared positionally.
    const goldenById = new Map();
    for (let r = 1; r < goldenRows.length; r++) {
      const id = normalizeId(goldenRows[r][1]);
      if (id) goldenById.set(id, goldenRows[r]);
    }
    expect(goldenById.size).toBe(53);

    const mismatches = [];

    rows.forEach((row, i) => {
      const golden = goldenById.get(row.studentId);
      if (!golden) {
        mismatches.push(`${row.studentId}: absent from the reference workbook`);
        return;
      }
      if (golden[0] !== row.identity['SL No'] && !isExpected(row.studentId, 'SL No')) {
        mismatches.push(`${row.studentId}: SL No ${row.identity['SL No']} vs ${golden[0]}`);
      }

      header.forEach((name, c) => {
        const ours = valueOf(row, name);
        const theirs = golden[c] ?? null;
        if (isExpected(row.studentId, name)) return;

        if (ours === null || ours === undefined) {
          if (theirs !== null && theirs !== undefined && theirs !== '') {
            mismatches.push(
              `${row.studentId} ${name} (${XLSX_COL(c)}): we wrote blank, reference has ${theirs}`,
            );
          }
          return;
        }
        if (typeof ours === 'number' && typeof theirs === 'number') {
          if (!closeEnough(ours, theirs)) {
            mismatches.push(
              `${row.studentId} ${name} (${XLSX_COL(c)}): ${ours} vs ${theirs}`,
            );
          }
          return;
        }
        if (String(ours).trim() !== String(theirs ?? '').trim()) {
          mismatches.push(`${row.studentId} ${name} (${XLSX_COL(c)}): ${ours} vs ${theirs}`);
        }
      });
    });

    expect(mismatches.slice(0, 40)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it('places the legend table where the reference puts it', async () => {
    await load();
    expect(run.model.rows.length + 1 + 7).toBe(61);
    const avgIndex = run.model.header.indexOf('AVG_3201');
    expect(avgIndex).toBe(12);
  });

  it('keeps EC = GP x credit and SGPA over the full batch credit', async () => {
    await load();
    for (const row of run.model.rows) {
      run.model.courses.forEach((result, i) => {
        const gp = row.courseCells[i][`GP_${result.course.code}`];
        const ec = row.courseCells[i][`EC_${result.course.code}`];
        expect(ec).toBeCloseTo(gp * result.credit, 9);
      });
      const expected = round(
        run.model.courses.reduce(
          (sum, result, i) => sum + row.courseCells[i][`GP_${result.course.code}`] * result.credit,
          0,
        ) / 18,
        2,
      );
      expect(row.sgpa).toBeCloseTo(expected, 9);
    }

    const first = run.model.rows.find((r) => r.studentId === '12222002');
    expect(first.sgpa).toBe(3.92);
    // Sorted by Student Id, so AHONA (12222002) is fifth, not first.
    expect(first.identity['SL No']).toBe(5);
    expect(first.identity.Reg).toBe('000018177');
    expect(first.identity.Name).toBe('AHONA TALUKDER');
  });

  it('sorts strictly by Student Id, unlike the reference', async () => {
    await load();
    const ids = run.model.rows.map((r) => r.studentId);
    expect(ids).toEqual([...ids].sort((a, b) => Number(a) - Number(b)));
    expect(ids[0]).toBe('12022021');
    expect(ids.at(-1)).toBe('12222062');
  });
});

function valueOf(row, headerName) {
  if (headerName in row.identity) return row.identity[headerName];
  if (headerName === 'SGPA') return row.sgpa;
  for (const cells of row.courseCells) {
    if (headerName in cells) return cells[headerName];
  }
  return null;
}

function XLSX_COL(index) {
  let letter = '';
  let n = index;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}