import fs from 'node:fs';
import path from 'node:path';

import { parseMarksFile } from '../src/parse/marksFile.js';
import { parseStudentMaster } from '../src/parse/studentMaster.js';
import { routeFiles } from '../src/parse/routing.js';
import { buildModel } from '../src/merge/buildModel.js';
import { getXlsx, readWorkbook } from '../src/parse/workbook.js';
import { normalizeId } from '../src/utils/numbers.js';

/** A File from a path, so the real browser-facing parser can be tested in node. */
export function fileFromPath(filePath, name) {
  const buffer = fs.readFileSync(filePath);
  return new File([buffer], name ?? path.basename(filePath));
}

export async function readMatrix(filePath, sheetName) {
  const XLSX = await getXlsx();
  const workbook = await readWorkbook(new Uint8Array(fs.readFileSync(filePath)).buffer);
  const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
}

/**
 * Run the whole pipeline over a slot manifest, exercising the real router rather
 * than hand-wiring the assignments. If the router ever misfiles one of the 18
 * fixtures, this fails here instead of silently producing a plausible sheet.
 */
export async function runBatch({ batch, files, dir }) {
  const master = await parseStudentMaster(fileFromPath(path.join(dir, files.master)));

  const parsed = [];
  for (const [slot, name] of Object.entries(files)) {
    if (slot === 'master') continue;
    parsed.push(await parseMarksFile(fileFromPath(path.join(dir, name))));
  }

  const { assignments, unrouted, warnings } = routeFiles(parsed, batch.courses);

  const missing = [];
  for (const course of batch.courses) {
    for (const role of rolesOf(course.type)) {
      if (!assignments.has(`${course.code}::${role}`)) {
        missing.push(`${course.code}/${role}`);
      }
    }
  }

  const model = buildModel({ config: batch, master, assignments });

  return { master, parsed, assignments, unrouted, routingWarnings: warnings, missing, model };
}

const ROLES = {
  regular: ['continuous', 'first', 'second'],
  viva: ['viva'],
  internship: ['thesis'],
};

export const rolesOf = (type) => ROLES[type] ?? [];

export { normalizeId };