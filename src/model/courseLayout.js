/**
 * Column prefixes for the Main sheet.
 *
 * These are a contract, not a style choice. result-sheet-gen infers the programme
 * from which prefix family it finds and THROWS if that disagrees with the user's
 * own dropdown -- get the programme wrong and the file is rejected outright.
 *
 * Provenance: result-sheet-gen/src/utils/courseModel.js
 */
export const PROGRAMMES = {
  BBA: {
    id: 'BBA',
    label: "BBA (Honor's)",
    caPrefixes: ['CA', 'AP', 'M1', 'M2'],
    caOutOf: 40,
    finalOutOf: 60,
    internshipLabel: 'Internship',
  },
  MBA: {
    id: 'MBA',
    label: 'MBA',
    caPrefixes: ['CA', 'A', 'CT', 'P', 'MS'],
    caOutOf: 60,
    finalOutOf: 40,
    internshipLabel: 'Thesis',
  },
};

export const DEFAULT_PROGRAMME = 'BBA';

/** 12 columns for a BBA regular course. */
export function regularColumns(programmeId) {
  const programme = PROGRAMMES[programmeId] ?? PROGRAMMES[DEFAULT_PROGRAMME];
  return [
    ...programme.caPrefixes.map((p) => `${p}_`),
    'ST_',
    'F1_',
    'F2_',
    'AVG_',
    'GT_',
    'GP_',
    'EC_',
    'LG_',
  ];
}

/**
 * Viva: the source carries a single total mark, so we emit the full V1..V4 group
 * with the mark in GT and leave V1..V4 blank. We never fabricate marks we were not
 * given. result-sheet-gen reads only GT, so the printed transcript is identical.
 */
export function vivaColumns() {
  return ['V1', 'V2', 'V3', 'V4', 'GT_', 'GP_', 'EC_', 'LG_'];
}

/** Internship / thesis: two reported components plus the total. */
export function internshipColumns() {
  return ['IR', 'IRD', 'GT_', 'GP_', 'EC_', 'LG_'];
}

/** Identity block. `SL No` is ignored downstream but present in live workbooks. */
export const IDENTITY_COLUMNS = ['SL No', 'Student Id', 'Name', 'Reg', 'Session'];

/** Always last: result-sheet-gen locates SGPA by name. */
export const SGPA_COLUMN = 'SGPA';

/** Per-component maxima, used for the out-of-range warning and nothing else. */
export const COMPONENT_MAX = {
  BBA: { CA: 5, AP: 5, M1: 15, M2: 15, ST: 40 },
  MBA: { CA: 10, A: 10, CT: 10, P: 10, MS: 20, ST: 60 },
};