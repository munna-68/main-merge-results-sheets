import { describe, expect, it } from 'vitest';

import { BATCH_3_2, FILES_3_2, coursePath, inputPath } from './fixtures/batch-3-2.js';
import { fileFromPath } from './helpers.js';
import { buildModel } from '../src/merge/buildModel.js';
import { parseMarksFile } from '../src/parse/marksFile.js';
import { parseStudentMaster } from '../src/parse/studentMaster.js';
import { routeFiles } from '../src/parse/routing.js';
import { columnsFor } from '../src/model/courseTypes.js';

const VIVA = 'Viva for 4-2 Semester & 5-2 Semester.xlsx';
const THESIS = 'MBA Year 2nd Semester Thesis or Research Paper.xlsx';

const master = () => parseStudentMaster(fileFromPath(inputPath('student-master.xlsx')));

const courseFiles = () =>
  Object.entries(FILES_3_2)
    .filter(([slot]) => slot !== 'master')
    .map(([, name]) => inputPath(name));

async function modelFor({ programme = 'BBA', extraCourses = [], extraFiles = [] }) {
  const config = {
    programme,
    yearLabel: '3rd Year',
    semesterLabel: '2nd Semester',
    courses: [...BATCH_3_2.courses, ...extraCourses],
  };
  const roster = await master();
  const parsed = [];
  for (const path of [...courseFiles(), ...extraFiles]) {
    parsed.push(await parseMarksFile(fileFromPath(path)));
  }
  const { assignments } = routeFiles(parsed, config.courses);
  return buildModel({ config, master: roster, assignments });
}

describe('viva and internship/thesis sources', () => {
  it('reads a viva that has only a total, without rejecting it', async () => {
    const viva = await parseMarksFile(fileFromPath(coursePath(VIVA)));
    expect(viva.totalOnly).toBe(true);
    expect(viva.shape).toBe('total-only');
    expect(viva.count).toBe(53);
    expect(viva.warnings.filter((w) => w.code === 'slot-conflict')).toHaveLength(0);
  });

  it('reads a thesis report with its two reported components', async () => {
    const thesis = await parseMarksFile(fileFromPath(coursePath(THESIS)));
    expect(thesis.shape).toBe('report');
    expect(thesis.contentCode).toBe('5207');
    expect(thesis.marks).toHaveLength(2);
    expect(thesis.rows[0].values).toEqual([45, 22]);
    expect(thesis.rows[0].recomputedTotal).toBe(67);
  });

  it('ignores the stray course-credit Sheet1 in both files', async () => {
    const viva = await parseMarksFile(fileFromPath(coursePath(VIVA)));
    expect(viva.sheetName).toBe('2202');
  });
});

describe('viva output shape', () => {
  const vivaCourse = { code: '4207', type: 'viva', title: 'Viva', credit: 3 };

  it('emits the full V1..V4 group with the mark in GT and V1..V4 blank', async () => {
    const model = await modelFor({
      extraCourses: [vivaCourse],
      extraFiles: [coursePath(VIVA)],
    });

    expect(model.header).toContain('V1');
    expect(model.header).toContain('V4');
    expect(model.header).toContain('GT_4207');

    const cells = model.rows[0].courseCells.at(-1);
    expect(cells.V1).toBeNull();
    expect(cells.V2).toBeNull();
    expect(cells.V3).toBeNull();
    expect(cells.V4).toBeNull();
    expect(cells['GT_4207']).toBeGreaterThan(0);
    expect(cells['LG_4207']).toMatch(/^[A-F]\+?$/);
  });

  it('orders regular courses first, then the viva', async () => {
    const model = await modelFor({
      extraCourses: [vivaCourse],
      extraFiles: [coursePath(VIVA)],
    });
    expect(model.header.indexOf('GT_3206')).toBeLessThan(
      model.header.indexOf('GT_4207'),
    );
  });

  it('counts viva credit in the SGPA denominator', async () => {
    const model = await modelFor({
      extraCourses: [vivaCourse],
      extraFiles: [coursePath(VIVA)],
    });
    expect(model.courses.reduce((s, c) => s + c.credit, 0)).toBe(21);
  });

  it('routes the viva to a viva slot rather than a regular one', async () => {
    const roster = await master();
    const parsed = [await parseMarksFile(fileFromPath(coursePath(VIVA)))];
    const { assignments, unrouted } = routeFiles(parsed, [
      ...BATCH_3_2.courses,
      vivaCourse,
    ]);
    expect(unrouted).toEqual([]);
    expect(assignments.has('4207::viva')).toBe(true);
    void roster;
  });
});

describe('thesis output shape', () => {
  const thesisCourse = {
    code: '5207',
    type: 'internship',
    title: 'Thesis or Research Paper',
    credit: 6,
  };

  it('maps onto IR / IRD / GT and grades it', async () => {
    const model = await modelFor({
      programme: 'MBA',
      extraCourses: [thesisCourse],
      extraFiles: [coursePath(THESIS)],
    });

    expect(model.header).toContain('IR');
    expect(model.header).toContain('IRD');

    const row = model.rows.find((r) => r.studentId === '12222002');
    const cells = row.courseCells.at(-1);
    expect(cells.IR).toBe(45);
    expect(cells.IRD).toBe(22);
    expect(cells['GT_5207']).toBe(67);
    expect(cells['GP_5207']).toBe(3.25); // 67 -> B+
    expect(cells['LG_5207']).toBe('B+');
    expect(cells['EC_5207']).toBeCloseTo(19.5, 9); // 3.25 x 6
  });

  it('honours a non-default credit', async () => {
    const model = await modelFor({
      programme: 'MBA',
      extraCourses: [thesisCourse],
      extraFiles: [coursePath(THESIS)],
    });
    const row = model.rows.find((r) => r.studentId === '12222002');
    expect(row.courseCells.at(-1)['EC_5207']).toBeCloseTo(19.5, 9);
  });
});

describe('MBA column layout', () => {
  it('uses the five MBA continuous components in order', () => {
    expect(columnsFor('regular', 'MBA')).toEqual([
      'CA_',
      'A_',
      'CT_',
      'P_',
      'MS_',
      'ST_',
      'F1_',
      'F2_',
      'AVG_',
      'GT_',
      'GP_',
      'EC_',
      'LG_',
    ]);
  });

  it('is 13 columns per course against 12 for BBA', () => {
    expect(columnsFor('regular', 'MBA')).toHaveLength(13);
    expect(columnsFor('regular', 'BBA')).toHaveLength(12);
  });

  it('builds an MBA model with the five-component block', async () => {
    const model = await modelFor({ programme: 'MBA' });
    expect(model.header).toContain('CA_3201');
    expect(model.header).toContain('A_3201');
    expect(model.header).toContain('CT_3201');
    expect(model.header).toContain('P_3201');
    expect(model.header).toContain('MS_3201');
    expect(model.header).toHaveLength(5 + 6 * 13 + 1);
  });
});