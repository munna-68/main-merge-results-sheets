import { COURSE_TYPES, COURSE_TYPE_LIST, ROLES } from '../model/courseTypes.js';

export const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
export const SEMESTER_OPTIONS = ['1st Semester', '2nd Semester'];

export const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

export const ordinal = (n) => ORDINALS[n - 1] ?? `${n}th`;

export const ordinalIndex = (label) => Math.max(1, ORDINALS.indexOf(label) + 1);

/** "3rd Year" -> 3 */
export const yearIndex = (label) => ordinalIndex(label.split(' ')[0]);
/** "2nd Semester" -> 2 */
export const semesterIndex = (label) => ordinalIndex(label.split(' ')[0]);

/**
 * Derive the default course codes for a batch: YYSS01 .. YYSSnn.
 *
 * YY is a running year index, never a BBA-only counter -- the university's own
 * viva sheet is titled "MIS 4207 or 5206", serving BBA 4th year and MBA 2nd
 * semester from a single file. Years run to at least 5.
 */
export function deriveCourses(programme, year, semester, count) {
  const prefix = `${yearIndex(year)}${semesterIndex(semester)}`;
  void programme; // codes do not depend on the programme
  return Array.from({ length: count }, (_, i) => ({
    code: `${prefix}${String(i + 1).padStart(2, '0')}`,
    type: 'regular',
    title: '',
    credit: 3,
  }));
}

export function defaultBatch() {
  return {
    programme: 'BBA',
    year: '3rd Year',
    semester: '2nd Semester',
    courseCount: 6,
    courses: deriveCourses('BBA', '3rd Year', '2nd Semester', 6),
  };
}

export { COURSE_TYPES, COURSE_TYPE_LIST, ROLES };