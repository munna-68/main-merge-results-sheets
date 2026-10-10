import { rolesFor } from '../model/courseTypes.js';
import { WARNINGS, warn } from '../utils/warnings.js';

export const slotKey = (courseCode, role) => `${courseCode}::${role}`;

/** Every fillable slot for the current course configuration. */
export function allSlots(courses) {
  const slots = [];
  for (const course of courses) {
    for (const role of rolesFor(course.type)) {
      slots.push({ course, role, key: slotKey(course.code, role) });
    }
  }
  return slots;
}

/**
 * Which role does this file want?
 *
 * Content shape settles three of the five roles outright: continuous-assessment
 * sheets announce themselves with Attendance/Assignment/Mid-Semester columns,
 * vivas have nothing but a total, and thesis reports name their components. Only
 * the two setter roles are genuinely indistinguishable from each other -- same
 * title block, same `1..6` question headers, same `Total (60%)` -- so for those
 * the file name is the only signal, and where even that is silent ("Final") the
 * file falls through to whichever slot is left over.
 *
 * Note "MIS 3203 1st Continous.xls" contains BOTH role keywords and is in fact
 * the continuous sheet. Shape outranks the file name, deliberately: a mislabelled
 * file name should not put a continuous assessment into a 1st-setter slot.
 */
export function inferRole(file) {
  if (file.shape === 'continuous') return 'continuous';
  if (file.totalOnly) return 'viva';
  if (file.shape === 'report') return 'thesis';

  const name = (file.fileName ?? '').toLowerCase();
  const second = /\b2\s*(?:nd|st)\b|second|examiner/.test(name);
  const first = /\b1\s*(?:st)\b|first/.test(name);
  if (second && !first) return 'second';
  if (first && !second) return 'first';
  return null;
}

/**
 * Choose a file's home among the slots.
 *
 * Neither source of the course code is trustworthy alone. `MIS 3103 Final.xlsx`
 * has the wrong filename and the right contents; `MIS 3204 2nd Examiner.xls` and
 * `MIS 3206 2nd setter.xlsx` have the right filename and the wrong contents.
 *
 * So: the filename is preferred whenever it names a slot that exists, because
 * in this corpus the filename is the department's own labelling of which exam
 * paper the file is. Contents break the tie only when the filename names
 * nothing in this batch. A genuine ambiguity is handed back to the user rather
 * than guessed at.
 */
function courseSlots(file, slots) {
  const byName = slots.filter((s) => file.filenameCode && s.course.code === file.filenameCode);
  if (byName.length) return byName;
  return slots.filter((s) => file.contentCode && s.course.code === file.contentCode);
}

function shapeFits(file, role) {
  if (role === 'viva') return file.totalOnly;
  if (role === 'thesis') return file.shape === 'report';
  return !file.totalOnly && file.shape !== 'report';
}

/**
 * Route dropped files into slots, in two passes.
 *
 * Confident files (course code plus an unambiguous role) claim their slots
 * first; the leftovers then take whatever compatible slot is still free, which
 * is how "MIS 3201 Final.xlsx" lands in 1st setter by elimination. Files that
 * still have more than one option are handed back to the user rather than
 * guessed at -- a wrong guess here silently mislabels a student's marks.
 */
export function routeFiles(parsedFiles, courses) {
  const slots = allSlots(courses);
  const assignments = new Map();
  const taken = new Set();
  const unrouted = [];
  const warnings = [];

  const files = parsedFiles.map((file) => ({ file, role: inferRole(file) }));

  for (const file of parsedFiles) {
    if (file.filenameCode && file.contentCode && file.filenameCode !== file.contentCode) {
      warnings.push(
        warn(
          WARNINGS.COURSE_DISAGREEMENT,
          `${file.fileName}: file name says MIS ${file.filenameCode}, contents say MIS ${file.contentCode}.`,
          'Routed on the file name unless it names no course in this batch.',
        ),
      );
    }
  }

  const place = (entry, allowLeftover) => {
    const { file } = entry;
    const options = courseSlots(file, slots);
    const codes = [file.filenameCode, file.contentCode].filter(Boolean);

    if (options.length === 0) {
      warnings.push(
        warn(
          WARNINGS.UNROUTED,
          `${file.fileName}: no course in this batch matches${
            codes.length ? ` MIS ${codes.join(' or ')}` : ' this file'
          }.`,
          'Assign it to a slot by hand, or check the course codes in the batch setup.',
        ),
      );
      unrouted.push({ file, reason: 'no matching course' });
      return;
    }

    let candidates = options.filter((slot) => shapeFits(file, slot.role));
    if (candidates.length === 0) candidates = options;

    if (entry.role) {
      const typed = candidates.filter((slot) => slot.role === entry.role);
      if (typed.length) candidates = typed;
    }

    const free = candidates.filter((slot) => !taken.has(slot.key));
    const pool = free.length ? free : candidates;

    if (pool.length === 1) {
      const slot = pool[0];
      if (taken.has(slot.key)) {
        warnings.push(
          warn(
            WARNINGS.SLOT_CONFLICT,
            `Two files both want the MIS ${slot.course.code} / ${slot.role} slot.`,
            `Kept "${assignments.get(slot.key).fileName}" and left "${file.fileName}" out.`,
          ),
        );
        unrouted.push({ file, reason: 'slot already filled' });
        return;
      }
      taken.add(slot.key);
      assignments.set(slot.key, file);
      if (slot.course.code === file.contentCode && slot.course.code !== file.filenameCode) {
        warnings.push(
          warn(
            WARNINGS.ROUTED_BY_CONTENT,
            `${file.fileName}: routed on its contents (MIS ${file.contentCode}); its file name says MIS ${file.filenameCode}, which is not in this batch.`,
            null,
          ),
        );
      }
      return;
    }

    if (allowLeftover && !entry.role && pool.length > 1) return; // retry with role known

    warnings.push(
      warn(
        WARNINGS.AMBIGUOUS_COURSE,
        `${file.fileName}: matches ${pool
          .map((s) => `MIS ${s.course.code} (${s.role})`)
          .join(' and ')}.`,
        'Assign it to a slot by hand.',
      ),
    );
    unrouted.push({ file, reason: 'ambiguous' });
  };

  files.filter((entry) => entry.role).forEach((entry) => place(entry, false));
  files.filter((entry) => !entry.role).forEach((entry) => place(entry, true));

  return { assignments, unrouted, warnings };
}

/** Shape checks that only make sense once a file has been given a slot. */
export function validateShapeForSlot(file, course, role) {
  const warnings = [];
  const expectsTotalOnly = role === 'viva' || role === 'thesis';

  if (expectsTotalOnly && !file.totalOnly && file.shape === 'continuous') {
    warnings.push(
      warn(
        WARNINGS.SLOT_CONFLICT,
        `${file.fileName}: this looks like a continuous-assessment file, but the ${role} slot wants a single reported total.`,
        null,
      ),
    );
  }
  if (!expectsTotalOnly && file.totalOnly) {
    warnings.push(
      warn(
        WARNINGS.SLOT_CONFLICT,
        `${file.fileName}: this file has only a total, no question marks, so it cannot fill a ${role} slot.`,
        null,
      ),
    );
  }
  if (role === 'thesis' && file.shape !== 'report') {
    warnings.push(
      warn(
        WARNINGS.SLOT_CONFLICT,
        `${file.fileName}: does not look like a thesis/internship report (expected report + presentation columns).`,
        null,
      ),
    );
  }
  return warnings;
}