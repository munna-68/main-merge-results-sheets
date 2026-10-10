import { describe, expect, it } from 'vitest';

import { BATCH_3_2, FILES_3_2, inputPath } from './fixtures/batch-3-2.js';
import { getXlsx, readWorkbook } from '../src/parse/workbook.js';
import { runBatch } from './helpers.js';
import { LEGEND_GAP, writeMainWorkbook } from '../src/write/mainSheet.js';
import { normalizeId } from '../src/utils/numbers.js';

const readMain = async (buffer) => {
  const XLSX = await getXlsx();
  const workbook = await readWorkbook(buffer);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Main, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  return { workbook, rows };
};

describe('writer: the Main sheet', () => {
  it('produces exactly one sheet named Main, as the consumer requires', async () => {
    const { model } = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    const { buffer } = await writeMainWorkbook({ model });
    const { workbook } = await readMain(buffer);
    expect(workbook.SheetNames).toEqual(['Main']);
  });

  it('round-trips every value the model computed', async () => {
    const { model } = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    const { buffer } = await writeMainWorkbook({ model });
    const { rows } = await readMain(buffer);

    const header = rows[0];
    const dataRows = rows.slice(1, 1 + model.rows.length);
    expect(dataRows).toHaveLength(53);

    model.rows.forEach((row, r) => {
      expect(normalizeId(dataRows[r][1])).toBe(row.studentId);
      expect(dataRows[r][2]).toBe(row.identity.Name);
      expect(String(dataRows[r][3])).toBe(row.identity.Reg);
      expect(dataRows[r][header.indexOf('SGPA')]).toBeCloseTo(row.sgpa, 9);
      for (const cells of row.courseCells) {
        for (const [name, value] of Object.entries(cells)) {
          if (value === null) continue;
          const written = dataRows[r][header.indexOf(name)];
          if (typeof value === 'number') {
            expect(written).toBeCloseTo(value, 9);
          } else {
            expect(written).toBe(value);
          }
        }
      }
    });
  });

  it('stores Student Id as text so leading digits survive', async () => {
    const { model } = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    const { buffer } = await writeMainWorkbook({ model });
    const { workbook, rows } = await readMain(buffer);

    const cell = workbook.Sheets.Main['B2'];
    expect(cell.t).toBe('s');
    expect(rows[1][1]).toBe('12022021');
    // The reference workbook itself is inconsistent here: 25 text, 28 numeric.
    expect(workbook.Sheets.Main['D2'].t).toBe('s');
  });

  it('writes the grade legend below the data, anchored to the first AVG column', async () => {
    const { model } = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    const { buffer, legendRow } = await writeMainWorkbook({ model });
    const { rows } = await readMain(buffer);

    const lastDataRow = model.rows.length + 1;
    expect(legendRow).toBe(lastDataRow + LEGEND_GAP);
    expect(legendRow).toBe(61);

    const legendHeader = rows[legendRow - 1];
    expect(legendHeader[12]).toBe('Marks');
    expect(legendHeader[13]).toBe('GP');
    expect(legendHeader[16]).toBe('LG');

    // Ascending 0..80, matching the department's workbooks.
    expect(rows[legendRow][12]).toBe(0);
    expect(rows[legendRow + 9][12]).toBe(80);
    expect(rows[legendRow][16]).toBe('F');
    expect(rows[legendRow + 9][16]).toBe('A+');
  });

  it('emits literals by default so nothing can read back as blank', async () => {
    const { model } = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    const { buffer } = await writeMainWorkbook({ model });
    const { workbook } = await readMain(buffer);

    const sheet = workbook.Sheets.Main;
    const header = [];
    for (let c = 0; ; c++) {
      const ref = XLSX_ref(c + 1, 1);
      if (!sheet[ref]) break;
      header.push(sheet[ref].v);
    }
    const gt = header.indexOf('GT_3201');
    const cell = sheet[XLSX_ref(gt, 2)];
    expect(cell.f).toBeUndefined();
    expect(typeof cell.v).toBe('number');
  });

  it('writes formulas with cached results when asked, so raw reads still work', async () => {
    const { model } = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    const { buffer } = await writeMainWorkbook({ model, useFormulas: true });
    const { workbook, rows } = await readMain(buffer);

    const header = rows[0];
    const gt = header.indexOf('GT_3201');
    const cell = workbook.Sheets.Main[XLSX_ref(gt, 2)];

    // The whole point: a formula must never be written without its value.
    expect(cell.f).toBeTruthy();
    expect(typeof cell.v).toBe('number');
    expect(cell.v).toBeCloseTo(model.rows[0].courseCells[0]['GT_3201'], 9);

    const sgpa = workbook.Sheets.Main[XLSX_ref(header.indexOf('SGPA'), 2)];
    expect(sgpa.f).toBeTruthy();
    expect(typeof sgpa.v).toBe('number');
  });

  it('flags low class attendance in every CA column, not just some', async () => {
    const { model } = await runBatch({ batch: BATCH_3_2, files: FILES_3_2, dir: inputPath('') });
    const { buffer, flagged } = await writeMainWorkbook({ model });
    expect(flagged).toBeGreaterThan(0);

    // output demo.xls only paints CA_02..CA_05, skipping two courses entirely.
    const { caColumns } = await import('../src/write/styling.js');
    const columns = caColumns(model.header, 'BBA');
    expect(columns).toHaveLength(6);
  });
});

/** Zero-based column index, matching the A1 encoder in src/write/mainSheet.js. */
function XLSX_ref(colIndex, row) {
  let letter = '';
  let n = colIndex;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${letter}${row}`;
}