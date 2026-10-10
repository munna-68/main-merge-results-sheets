import { IDENTITY_COLUMNS, SGPA_COLUMN } from '../model/courseLayout.js';
import { orderedCourses } from '../model/courseTypes.js';
import { computeCourse, computeSgpa } from './compute.js';
import { WARNINGS, warn } from '../utils/warnings.js';

/**
 * Join identity, courses and calculations into the exact grid that becomes the
 * Main sheet.
 *
 * The student master is the roster: every master row produces one output row. A
 * student who is enrolled but absent from a mark file is reported, not dropped
 * -- a missing student is a question for the department, and silently omitting
 * them from a signed transcript is not an acceptable way to ask it.
 */
export function buildModel({ config, master, assignments }) {
  const warnings = [];
  const courses = orderedCourses(config.courses);

  const courseResults = courses.map((course) => {
    const files = {};
    for (const role of ['continuous', 'first', 'second', 'viva', 'thesis']) {
      files[role] = assignments.get(`${course.code}::${role}`) ?? null;
    }
    const result = computeCourse({
      course,
      programmeId: config.programme,
      files,
      credit: course.credit ?? 3,
    });
    warnings.push(...result.collectWarnings());
    return result;
  });

  const header = [
    ...IDENTITY_COLUMNS,
    ...courseResults.flatMap((result) => result.header),
    SGPA_COLUMN,
  ];

  // Ascending by Student Id, single group. The department's own workbooks append
  // a few earlier-session students at the end; this app is deliberately uniform.
  const ordered = [...master.students].sort((a, b) => Number(a.id) - Number(b.id));

  const rows = ordered.map((student, index) => {
    const identity = {
      'SL No': index + 1,
      'Student Id': student.id,
      Name: student.name,
      Reg: student.reg,
      Session: student.session,
    };

    const courseCells = [];
    const gps = [];
    let missingSomewhere = false;

    courseResults.forEach((result) => {
      const { cells, gp } = result.cellFor(student.id);
      courseCells.push(cells);
      gps.push(gp);
      if (!Object.values(cells).some((v) => v !== null)) missingSomewhere = true;
    });

    return {
      studentId: student.id,
      name: student.name,
      identity,
      courseCells,
      sgpa: computeSgpa(courseResults.map((r, i) => ({ gp: gps[i], credit: r.credit }))),
      missingSomewhere,
    };
  });

  // Roster reconciliation.
  const markIds = new Set();
  for (const parsed of assignments.values()) {
    for (const id of parsed.studentIds) markIds.add(id);
  }

  const onlyInMarks = [...markIds].filter((id) => !master.byId.has(id));
  if (onlyInMarks.length) {
    warnings.push(
      warn(
        WARNINGS.MARKS_ONLY,
        `${onlyInMarks.length} student${onlyInMarks.length === 1 ? '' : 's'} appear${
          onlyInMarks.length === 1 ? 's' : ''
        } in a mark file but not in the student master (${onlyInMarks.slice(0, 6).join(', ')}${
          onlyInMarks.length > 6 ? ', ...' : ''
        }).`,
        'Excluded: the student master is the enrolment list.',
      ),
    );
  }

  const masterIds = master.students.map((s) => s.id);
  const noMarks = masterIds.filter((id) => !markIds.has(id));
  if (noMarks.length) {
    warnings.push(
      warn(
        WARNINGS.MASTER_ONLY,
        `${noMarks.length} student${noMarks.length === 1 ? '' : 's'} on the master list${
          noMarks.length === 1 ? ' is' : ' are'
        } in no mark file (${noMarks.slice(0, 6).join(', ')}${noMarks.length > 6 ? ', ...' : ''}).`,
        'Their row is kept, with blank marks.',
      ),
    );
  }

  const partial = rows.filter((r) => r.missingSomewhere);
  if (partial.length) {
    warnings.push(
      warn(
        WARNINGS.MASTER_ONLY,
        `${partial.length} student${partial.length === 1 ? '' : 's'} have no marks for at least one course.`,
        'Blank cells stay blank; totals still compute from zero.',
      ),
    );
  }

  return { header, rows, courses: courseResults, warnings, config };
}

function valueFor(row, headerName) {
  if (headerName in row.identity) return row.identity[headerName];
  if (headerName === 'SGPA') return row.sgpa;
  for (const cells of row.courseCells) {
    if (headerName in cells) return cells[headerName];
  }
  return null;
}