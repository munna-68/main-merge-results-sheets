import { PROGRAMMES, DEFAULT_PROGRAMME } from '../model/courseLayout.js';

/**
 * Styling targets the department's own workbooks: header in Times New Roman,
 * body in Arial, name and SGPA pulled back to Times New Roman bold, gridlines
 * off. `output demo.xls` carries no explicit widths, so the widths below are
 * taken from the current live 3,2 workbook, which is the newer evolution of it.
 */
export const HEADER_FONT = { name: 'Times New Roman', size: 10, bold: true };
export const BODY_FONT = { name: 'Arial', size: 10 };
export const EMPHASIS_FONT = { name: 'Times New Roman', size: 10, bold: true };

export const WIDTHS = {
  'SL No': 9.2,
  'Student Id': 11.5,
  Name: 27.7,
  Reg: 13.5,
  Session: 10.7,
  default: 9.1,
};

export const TEXT_HEADERS = new Set(['Student Id', 'Name', 'Reg', 'Session']);

export function isLetterColumn(headerName) {
  const token = headerName.includes('_') ? headerName.slice(0, headerName.indexOf('_')) : headerName;
  return /^(LG|V\d|IR|IRD)$/.test(token);
}

export function widthFor(headerName) {
  return WIDTHS[headerName] ?? WIDTHS.default;
}

export function fontFor(headerName) {
  if (headerName === 'Name' || headerName === 'SGPA') return EMPHASIS_FONT;
  return BODY_FONT;
}

export function applyHeaderStyle(cell) {
  cell.font = HEADER_FONT;
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
}

export function applyBodyStyle(cell, headerName) {
  cell.font = fontFor(headerName);
  if (TEXT_HEADERS.has(headerName)) {
    cell.numFmt = '@';
    cell.alignment = { horizontal: headerName === 'Name' ? 'left' : 'center' };
  } else if (headerName === 'SL No') {
    cell.alignment = { horizontal: 'center' };
  } else if (isLetterColumn(headerName)) {
    cell.alignment = { horizontal: 'center' };
  } else {
    cell.numFmt = '0.00';
    cell.alignment = { horizontal: 'right' };
  }
}

/**
 * CA columns are the ones that can be flagged for attendance.
 *
 * `output demo.xls` applies its below-3.5 rule to CA_02..CA_05 only, silently
 * skipping CA_01 and CA_06 -- an attendance alarm that ignores a third of the
 * courses. We apply it to every CA column; it changes no cell value.
 */
export function caColumns(header, programmeId = DEFAULT_PROGRAMME) {
  const prefixes = PROGRAMMES[programmeId]?.caPrefixes ?? ['CA'];
  const wanted = new Set(prefixes.map((p) => `${p}_`));
  return header
    .map((name, index) => ({ name, index }))
    .filter(({ name }) => {
      if (!name.includes('_')) return false;
      const token = name.slice(0, name.indexOf('_') + 1);
      return wanted.has(token) && name.startsWith('CA_');
    })
    .map(({ index }) => index);
}

export const ATTENDANCE_THRESHOLD = 3.5;

/**
 * Flag class attendance below 3.5.
 *
 * Painted as a direct fill rather than a conditional-formatting rule: the source
 * workbooks are legacy .xls and do the same, and a static fill renders
 * identically in Excel, LibreOffice and the PDF the department prints from.
 */
export function applyAttendanceRule(worksheet, header, lastDataRow, programmeId) {
  const columns = caColumns(header, programmeId);
  let painted = 0;

  for (const index of columns) {
    for (let r = 2; r <= lastDataRow; r++) {
      const cell = worksheet.getRow(r).getCell(index + 1);
      if (typeof cell.value === 'number' && cell.value < ATTENDANCE_THRESHOLD) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFF00' },
        };
        painted += 1;
      }
    }
  }
  return painted;
}