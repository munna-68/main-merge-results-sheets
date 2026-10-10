/**
 * SheetJS reader.
 *
 * Dynamically imported so the ~400kB parser never lands in the initial bundle --
 * nothing needs to read a spreadsheet until the user drops a file.
 */
let lib = null;

export async function getXlsx() {
  if (!lib) lib = await import('xlsx');
  return lib;
}

export async function readWorkbook(arrayBuffer) {
  const XLSX = await getXlsx();
  return XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
}

export async function readFile(file) {
  return readWorkbook(await file.arrayBuffer());
}

/**
 * Sheet -> array of row arrays, raw values, nulls for empty cells.
 *
 * blankrows:false is load-bearing: these workbooks carry signature rows and
 * date stamps between the data blocks, and compacting them away keeps the
 * "is this row a student?" test a single question.
 */
export function sheetToMatrix(XLSX, sheet) {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

export function listSheets(XLSX, workbook) {
  return workbook.SheetNames.map((name) => ({
    name,
    matrix: sheetToMatrix(XLSX, workbook.Sheets[name]),
  }));
}