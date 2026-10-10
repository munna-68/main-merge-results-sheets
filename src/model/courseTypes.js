import {
  DEFAULT_PROGRAMME,
  PROGRAMMES,
  internshipColumns,
  regularColumns,
  vivaColumns,
} from './courseLayout.js';

/**
 * The three course types.
 *
 * Internship vs thesis is deliberately NOT a user choice: result-sheet-gen labels a
 * single internship-typed course "Internship" under BBA and "Thesis" under MBA,
 * automatically, from the programme setting. Offering the user a choice would only
 * produce configurations that contradict the printed output.
 */
export const COURSE_TYPES = {
  regular: {
    id: 'regular',
    label: 'Regular',
    blurb: 'Continuous assessment + 1st setter + 2nd setter',
    roles: ['continuous', 'first', 'second'],
    columns: (programmeId) => regularColumns(programmeId),
  },
  viva: {
    id: 'viva',
    label: 'Viva',
    blurb: 'Single viva total, reported in GT',
    roles: ['viva'],
    columns: () => vivaColumns(),
  },
  internship: {
    id: 'internship',
    label: 'Internship / Thesis',
    blurb: 'Report + viva components, reported in IR / IRD',
    roles: ['thesis'],
    columns: () => internshipColumns(),
  },
};

export const COURSE_TYPE_LIST = ['regular', 'viva', 'internship'];

export const ROLES = {
  continuous: { id: 'continuous', label: 'Continuous Assessment', short: 'CA' },
  first: { id: 'first', label: '1st Setter', short: '1st' },
  second: { id: 'second', label: '2nd Setter', short: '2nd' },
  viva: { id: 'viva', label: 'Viva', short: 'Viva' },
  thesis: { id: 'thesis', label: 'Thesis / Internship', short: 'Thesis' },
};

export function rolesFor(typeId) {
  return COURSE_TYPES[typeId]?.roles ?? [];
}

export function columnsFor(typeId, programmeId) {
  const type = COURSE_TYPES[typeId] ?? COURSE_TYPES.regular;
  return type.columns(programmeId ?? DEFAULT_PROGRAMME);
}

/** Internship/thesis is labelled from the programme -- see note above. */
export function internshipLabelFor(programmeId) {
  return (PROGRAMMES[programmeId] ?? PROGRAMMES[DEFAULT_PROGRAMME]).internshipLabel;
}

/**
 * Output column order: regular courses by code ascending, then viva, then
 * internship/thesis. result-sheet-gen groups by suffix and orders courses by
 * left-to-right position, so this ordering is part of the contract.
 */
export function orderedCourses(courses) {
  const rank = { regular: 0, viva: 1, internship: 2 };
  return [...courses].sort(
    (a, b) =>
      (rank[a.type] ?? 9) - (rank[b.type] ?? 9) ||
      String(a.code).localeCompare(String(b.code)),
  );
}