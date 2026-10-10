import { classifyShape, locateHeaderRow, profileColumns } from './columns.js';

/**
 * Choose which sheet in a workbook holds the marks.
 *
 * Purely structural: the sheet with an ID column and the most usable mark
 * columns wins. Never trust the sheet NAME -- `MIS 3103 Final.xlsx` keeps its
 * data on `Sheet1` while its real content is on `Sheet3`-named tabs, the MBA
 * thesis data lives on a sheet called `2202`, and every file in the corpus
 * carries a stray `Sheet1` course-credit table that has no ID column at all.
 */
export function pickDataSheet(sheets) {
  let best = null;

  for (const sheet of sheets) {
    const header = locateHeaderRow(sheet.matrix);
    if (!header) continue;
    const profile = profileColumns(sheet.matrix, header.index, header.idCol);
    if (profile.dataRows.length === 0) continue;

    const candidate = {
      name: sheet.name,
      matrix: sheet.matrix,
      ...profile,
      shape: classifyShape(sheet.matrix, profile),
    };

    const score = profile.marks.length;
    if (
      !best ||
      score > best.marks.length ||
      (score === best.marks.length && profile.dataRows.length > best.dataRows.length)
    ) {
      best = candidate;
    }
  }

  return best;
}

