import { GRADE_BANDS, legendRows } from '../model/gradeScale.js';
import {
  applyAttendanceRule,
  applyBodyStyle,
  applyHeaderStyle,
  widthFor,
} from './styling.js';

/** The legend sits seven rows below the last data row, as in the source workbooks. */
export const LEGEND_GAP = 7;

export const colLetter = (index) => {
  let letter = '';
  let n = index;
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
};

/**
 * Write the single Main sheet.
 *
 * Values are literals by default. result-sheet-gen reads with `raw: true`, and
 * ExcelJS emits a formula with no cached result as `<f>` and no `<v>` -- which
 * arrives downstream as `null` and prints as a BLANK CELL in a signed
 * transcript. A literal cannot go missing that way. Formula mode is offered for
 * auditors who want to see the arithmetic, and every formula written in that
 * mode carries its computed result so the cached value is never absent.
 */
export async function writeMainWorkbook({ model, useFormulas = false }) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Main Merge Result Sheet';
  workbook.created = new Date(0);

  const sheet = workbook.addWorksheet('Main', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
  });

  const header = model.header;
  const rows = model.rows;
  const lastDataRow = rows.length + 1;
  const plan = useFormulas ? buildFormulaPlan(model, header) : null;

  sheet.columns = header.map((name) => ({ key: name, width: widthFor(name) }));

  const headerRow = sheet.getRow(1);
  header.forEach((name, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = name;
    applyHeaderStyle(cell);
  });

  rows.forEach((row, r) => {
    const excelRow = r + 2;
    header.forEach((name, i) => {
      const cell = sheet.getRow(excelRow).getCell(i + 1);
      const literal = valueFor(row, name);
      const formula = plan?.get(name);
      if (formula && literal !== null) {
        cell.value = { formula: formula(excelRow), result: literal };
      } else {
        cell.value = literal;
      }
      applyBodyStyle(cell, name);
    });
  });

  const flagged = applyAttendanceRule(sheet, header, lastDataRow, model.config.programme);
  const legendRow = writeLegend(sheet, header, lastDataRow);

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, flagged, lastDataRow, legendRow };
}

function valueFor(row, headerName) {
  if (headerName in row.identity) return row.identity[headerName];
  if (headerName === 'SGPA') return row.sgpa;
  for (const cells of row.courseCells) {
    if (headerName in cells) return cells[headerName];
  }
  return null;
}

/**
 * Formula map: header name -> (rowNumber) => formula string.
 *
 * Only genuine arithmetic becomes a formula. Source marks stay literals because
 * they were read out of someone else's workbook and rewriting them as a sum
 * would hide exactly the discrepancies the app exists to surface.
 */
function buildFormulaPlan(model, header) {
  const plan = new Map();
  const col = new Map(header.map((name, i) => [name, i]));
  const letter = (name) => colLetter(col.get(name));

  const nested = (gtCol, pick) => {
    let expr = pick(GRADE_BANDS[GRADE_BANDS.length - 1]);
    for (let i = GRADE_BANDS.length - 2; i >= 0; i--) {
      const band = GRADE_BANDS[i];
      expr = `IF(${gtCol}>=${band.min},${pick(band)},${expr})`;
    }
    return expr;
  };

  const totalCredits = model.courses.reduce((sum2, c) => sum2 + c.credit, 0);

  for (const result of model.courses) {
    const { course } = result;
    const code = course.code;
    const caPrefixes =
      model.config.programme === 'MBA' ? ['CA', 'A', 'CT', 'P', 'MS'] : ['CA', 'AP', 'M1', 'M2'];

    const caCols = caPrefixes.map((p) => header.indexOf(`${p}_${code}`)).filter((i) => i >= 0);
    if (caCols.length > 1) {
      plan.set(`ST_${code}`, (r) => {
        const first = letter(`${caPrefixes[0]}_${code}`);
        const last = letter(`${caPrefixes[caCols.length - 1]}_${code}`);
        return `SUM(${first}${r}:${last}${r})`;
      });
    }

    const f1 = letter(`F1_${code}`);
    const f2 = letter(`F2_${code}`);
    plan.set(`AVG_${code}`, (r) => `(${f1}${r}+${f2}${r})/2`);
    plan.set(`GT_${code}`, (r) => `ROUNDUP(${letter(`ST_${code}`)}${r}+${letter(`AVG_${code}`)}${r},0)`);
    plan.set(
      `GP_${code}`,
      (r) => nested(`${letter(`GT_${code}`)}${r}`, (b) => b.gp),
    );
    plan.set(`LG_${code}`, (r) => nested(`${letter(`GT_${code}`)}${r}`, (b) => `"${b.lg}"`));
    plan.set(`EC_${code}`, (r) => `${letter(`GP_${code}`)}${r}*${result.credit}`);
  }

  const gpCells = model.courses
    .map((result, i) => `${colLetter(header.indexOf(`GP_${result.course.code}`))}*${result.credit}`)
    .filter((s) => !s.startsWith('-'));
  if (gpCells.length) {
    plan.set('SGPA', () => `ROUND((${gpCells.join('+')})/${totalCredits},2)`);
  }

  return plan;
}

/**
 * The Marks / GP / LG lookup table under the data.
 *
 * Anchored to the first course's AVG column, which is where both reference
 * workbooks put it (L in `output demo.xls`, M in the current 3,2 sheet -- the
 * one-column shift is just the `SL No` column they added).
 */
function writeLegend(sheet, header, lastDataRow) {
  const startRow = lastDataRow + LEGEND_GAP;
  const anchor = header.findIndex((name) => name.startsWith('AVG_'));
  const firstCol = (anchor >= 0 ? anchor : 12) + 1;

  const block = [
    ['Marks', 'GP', '', '', 'LG'],
    ...legendRows().map((r) => [r.marks, r.gp, '', '', r.lg]),
  ];

  block.forEach((values, r) => {
    values.forEach((value, c) => {
      if (value === '' || value === null) return;
      const cell = sheet.getRow(startRow + r).getCell(firstCol + c);
      cell.value = value;
      cell.font = { name: 'Times New Roman', size: 10, bold: r === 0 };
      cell.alignment = { horizontal: c === 0 ? 'left' : 'center' };
      if (c === 1) cell.numFmt = '0.00';
    });
  });

  return startRow;
}