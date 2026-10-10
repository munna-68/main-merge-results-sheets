import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_DIR = path.join(here, '..', 'fixtures');
export const INPUT_DIR = path.join(FIXTURE_DIR, 'inputs');
export const GOLDEN_DIR = path.join(FIXTURE_DIR, 'golden');
export const COURSE_DIR = path.join(FIXTURE_DIR, 'courses');
export const TRAP_DIR = path.join(FIXTURE_DIR, 'traps');
export const REFERENCE_DIR = path.join(here, '..', '..', 'reference');

/**
 * The 3rd Year 2nd Semester BBA batch, 2025.
 *
 * Reproduces the department's own published result sheet cell for cell.
 * Titles are carried for display only; nothing downstream reads them.
 */
export const BATCH_3_2 = {
  programme: 'BBA',
  yearLabel: '3rd Year',
  semesterLabel: '2nd Semester',
  courses: [
    { code: '3201', type: 'regular', title: 'Database Management', credit: 3 },
    { code: '3202', type: 'regular', title: 'Management Accounting', credit: 3 },
    { code: '3203', type: 'regular', title: 'Management Science', credit: 3 },
    { code: '3204', type: 'regular', title: 'Bank and Insurance Management', credit: 3 },
    { code: '3205', type: 'regular', title: 'Data Communications and Networking', credit: 3 },
    { code: '3206', type: 'regular', title: 'Simulation', credit: 3 },
  ],
};

/**
 * Slot -> fixture file.
 *
 * Two entries are deliberate mismatches that the router has to survive:
 * `MIS 3103 Final.xlsx` carries the wrong filename, and the 2nd-setter files for
 * 3204 and 3206 carry the wrong course code in their title block.
 */
export const FILES_3_2 = {
  master: 'student-master.xlsx',
  '3201::continuous': 'MIS 3201 Continuous.xlsx',
  '3201::first': 'MIS 3201 Final.xlsx',
  '3201::second': 'MIS 3201 2nd setter.xlsx',
  '3202::continuous': 'Continuous MIS 3202.xlsx',
  '3202::first': 'MIS 3202 1st setter.xls',
  '3202::second': 'MIS 3202 2nd Examiner.xls',
  '3203::continuous': 'MIS 3203 1st Continous.xls',
  '3203::first': 'MIS 3103 Final.xlsx',
  '3203::second': 'MIS 3203 2nd  setter.xls',
  '3204::continuous': 'MIS 3204 Continuous.xlsx',
  '3204::first': 'MIS 3204 1st Setter.xls',
  '3204::second': 'MIS 3204 2nd Examiner.xls',
  '3205::continuous': 'MIS 3205 Continuous.xlsx',
  '3205::first': 'MIS 3205 1st setter.xlsx',
  '3205::second': 'MIS 3205 2nd  setter.xls',
  '3206::continuous': 'Continuous MIS 3206.xlsx',
  '3206::first': 'MIS 3206 1st setter.xls',
  '3206::second': 'MIS 3206 2nd setter.xlsx',
};

export const inputPath = (name) => path.join(INPUT_DIR, name);
export const coursePath = (name) => path.join(COURSE_DIR, name);
export const goldenPath = (name) => path.join(GOLDEN_DIR, name);
export const referencePath = (name) => path.join(REFERENCE_DIR, name);