import { lookup } from '../model/gradeScale.js';
import { COMPONENT_MAX, PROGRAMMES, DEFAULT_PROGRAMME } from '../model/courseLayout.js';
import { ROLES, columnsFor, rolesFor } from '../model/courseTypes.js';
import { round, roundUp } from '../utils/numbers.js';
import { WARNINGS, warn } from '../utils/warnings.js';

/**
 * A column token ending in `_` is per-course and gets the course code appended
 * (`CA_` -> `CA_3201`). Bare tokens are global single-course columns and must
 * stay bare, because that is what result-sheet-gen looks for: V1..V4 for a viva,
 * IR/IRD for an internship or thesis.
 */
export const columnName = (token, code) => (token.endsWith('_') ? `${token}${code}` : token);

const index = (parsed) =>
  parsed ? new Map(parsed.rows.map((row) => [row.studentId, row])) : null;

/**
 * Derive every cell of one course for one student.
 *
 * Blank semantics follow the department's own workbook exactly: a blank source
 * cell is written blank, but the computed chain treats it as zero. That is what
 * produces `12022062`'s `AVG_01 = 0.0`, `GT_01 = 4.0`, `LG_01 = F` when her
 * setter marks are missing. The alternative -- refusing to average a partial
 * row -- would invent a mark the examiner never awarded.
 */
export function computeCourse({ course, programmeId, files, credit }) {
  const programme = PROGRAMMES[programmeId] ?? PROGRAMMES[DEFAULT_PROGRAMME];
  const tokens = columnsFor(course.type, programmeId);
  const header = tokens.map((token) => columnName(token, course.code));
  const maps = {
    continuous: index(files.continuous),
    first: index(files.first),
    second: index(files.second),
    viva: index(files.viva),
    thesis: index(files.thesis),
  };
  const maxima = COMPONENT_MAX[programmeId] ?? COMPONENT_MAX.BBA;

  const outOfRange = [];

  const blank = () => Object.fromEntries(header.map((name) => [name, null]));

  function finish(cells, gt) {
    const grade = lookup(gt);
    if (!grade) return null;
    const gp = grade.gp;
    cells[columnName('GP_', course.code)] = gp;
    cells[columnName('EC_', course.code)] = round(gp * credit, 2);
    cells[columnName('LG_', course.code)] = grade.lg;
    return gp;
  }

  function cellFor(studentId) {
    const cells = blank();

    if (course.type === 'regular') {
      const cont = maps.continuous?.get(studentId);
      if (cont) {
        programme.caPrefixes.forEach((prefix, i) => {
          const value = cont.values[i];
          cells[columnName(`${prefix}_`, course.code)] = value ?? null;
          const max = maxima[prefix];
          if (value !== null && value !== undefined && max !== undefined && value > max) {
            outOfRange.push({
              id: studentId,
              column: columnName(`${prefix}_`, course.code),
              value,
              max,
            });
          }
        });
        cells[columnName('ST_', course.code)] = cont.recomputedTotal;
      }

      const f1 = maps.first?.get(studentId);
      const f2 = maps.second?.get(studentId);
      cells[columnName('F1_', course.code)] = f1 ? f1.recomputedTotal : null;
      cells[columnName('F2_', course.code)] = f2 ? f2.recomputedTotal : null;

      const st = cells[columnName('ST_', course.code)] ?? 0;
      const avg = ((cells[columnName('F1_', course.code)] ?? 0) +
        (cells[columnName('F2_', course.code)] ?? 0)) /
        2;
      cells[columnName('AVG_', course.code)] = avg;

      const gt = roundUp(st + avg);
      cells[columnName('GT_', course.code)] = gt;
      return { cells, gp: finish(cells, gt) };
    }

    if (course.type === 'viva') {
      const row = maps.viva?.get(studentId);
      const gt = row ? row.mark : null;
      cells[columnName('GT_', course.code)] = gt;
      // V1..V4 stay blank: the source reported one total, and we do not
      // fabricate four marks we were never given.
      return { cells, gp: gt === null ? null : finish(cells, gt) };
    }

    const row = maps.thesis?.get(studentId);
    if (row) {
      cells.IR = row.values[0] ?? null;
      cells.IRD = row.values[1] ?? null;
    }
    const gt = row ? row.mark : null;
    cells[columnName('GT_', course.code)] = gt;
    return { cells, gp: gt === null ? null : finish(cells, gt) };
  }

  return {
    course,
    header,
    credit,
    cellFor,
    collectWarnings() {
      const out = [];
      // Only the roles this course type actually needs. A regular course has no
      // viva or thesis slot at all, so reporting those as "missing" would bury
      // the warnings that matter under noise.
      const absent = rolesFor(course.type).filter((role) => !maps[role]);
      if (absent.length) {
        out.push(
          warn(
            WARNINGS.SLOT_CONFLICT,
            `MIS ${course.code}: no file supplied for ${absent.map((r) => ROLES[r].label).join(', ')}.`,
            'Those cells will be blank.',
          ),
        );
      }
      if (outOfRange.length) {
        const first = outOfRange[0];
        out.push(
          warn(
            WARNINGS.COMPONENT_OUT_OF_RANGE,
            `MIS ${course.code}: ${outOfRange.length} class-attendance value${
              outOfRange.length === 1 ? '' : 's'
            } above the maximum for that component.`,
            `Example: ${first.id} has ${first.column} = ${first.value}, maximum ${first.max}.`,
          ),
        );
      }
      return out;
    },
  };
}

/**
 * SGPA over every course in the sheet, including the ones the student failed.
 *
 * The denominator is the total credit of the batch, not of the courses passed:
 * `12022062` earns 3 credits and her SGPA is 0.46 = (2.75 x 3) / 18.
 */
export function computeSgpa(courseResults) {
  let earned = 0;
  let possible = 0;
  let scored = 0;

  for (const result of courseResults) {
    possible += result.credit;
    if (result.gp === null || result.gp === undefined) continue;
    earned += result.gp * result.credit;
    scored += 1;
  }

  if (scored === 0 || possible === 0) return null;
  return round(earned / possible, 2);
}