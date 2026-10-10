import { PROGRAMMES, DEFAULT_PROGRAMME } from '../model/courseLayout.js';
import { COURSE_TYPES, COURSE_TYPE_LIST } from '../model/courseTypes.js';
import {
  SEMESTER_OPTIONS,
  YEAR_OPTIONS,
  deriveCourses,
} from './batchConfig.js';

const ROLES_FOR_TYPE = {
  regular: ['continuous', 'first', 'second'],
  viva: ['viva'],
  internship: ['thesis'],
};

const ROLE_LABEL = {
  continuous: 'Continuous',
  first: '1st Setter',
  second: '2nd Setter',
  viva: 'Viva',
  thesis: 'Thesis',
};

export default function BatchConfiguration({ batch, onChange, locked }) {
  const programme = PROGRAMMES[batch.programme] ?? PROGRAMMES[DEFAULT_PROGRAMME];

  const set = (patch) => onChange({ ...batch, ...patch });

  const regenerate = (patch) => {
    const next = { ...batch, ...patch };
    const keepCodes = JSON.stringify(batch.courses.map((c) => c.code));
    const wanted = JSON.stringify(
      deriveCourses(next.programme, next.year, next.semester, next.courseCount).map((c) => c.code),
    );
    // Preserve a hand-edited course table unless the shape actually changed.
    next.courses =
      keepCodes === wanted
        ? batch.courses
        : deriveCourses(next.programme, next.year, next.semester, next.courseCount);
    onChange(next);
  };

  const setCourse = (i, patch) => {
    const courses = batch.courses.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onChange({ ...batch, courses });
  };

  const slotCount = batch.courses.reduce(
    (n, c) => n + (ROLES_FOR_TYPE[c.type] ?? []).length,
    0,
  );

  return (
    <section className="card p-6">
      <header className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">1 &middot; Batch setup</h2>
        <p className="mt-1 text-sm text-muted">
          Course codes derive automatically and stay editable — change any of them, set the
          credit, or mark a course as a viva or thesis.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label mb-1.5" htmlFor="programme">
            Programme
          </label>
          <select
            id="programme"
            className="input"
            value={batch.programme}
            disabled={locked}
            onChange={(e) => regenerate({ programme: e.target.value })}
          >
            {Object.values(PROGRAMMES).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label mb-1.5" htmlFor="year">
            Year
          </label>
          <select
            id="year"
            className="input"
            value={batch.year}
            disabled={locked}
            onChange={(e) => regenerate({ year: e.target.value })}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label mb-1.5" htmlFor="semester">
            Semester
          </label>
          <select
            id="semester"
            className="input"
            value={batch.semester}
            disabled={locked}
            onChange={(e) => regenerate({ semester: e.target.value })}
          >
            {SEMESTER_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label mb-1.5" htmlFor="count">
            Courses
          </label>
          <input
            id="count"
            type="number"
            min={1}
            max={12}
            className="input"
            value={batch.courseCount}
            disabled={locked}
            onChange={(e) =>
              regenerate({ courseCount: Math.max(1, Number(e.target.value) || 1) })
            }
          />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto scroll-thin">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label pb-2 pr-3">Course code</th>
              <th className="label pb-2 pr-3">Type</th>
              <th className="label pb-2 pr-3">Title</th>
              <th className="label pb-2 pr-3 w-24">Credit</th>
              <th className="label pb-2 w-40">Files needed</th>
            </tr>
          </thead>
          <tbody>
            {batch.courses.map((course, i) => (
              <tr key={i} className="border-b border-line/60">
                <td className="py-2 pr-3">
                  <input
                    className="input font-mono"
                    value={course.code}
                    disabled={locked}
                    onChange={(e) => setCourse(i, { code: e.target.value })}
                    aria-label={`Course ${i + 1} code`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <select
                    className="input"
                    value={course.type}
                    disabled={locked}
                    onChange={(e) => setCourse(i, { type: e.target.value })}
                    aria-label={`Course ${course.code} type`}
                  >
                    {COURSE_TYPE_LIST.map((t) => (
                      <option key={t} value={t}>
                        {COURSE_TYPES[t].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <input
                    className="input"
                    placeholder="optional"
                    value={course.title}
                    disabled={locked}
                    onChange={(e) => setCourse(i, { title: e.target.value })}
                    aria-label={`Course ${course.code} title`}
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={0.5}
                    value={course.credit}
                    disabled={locked}
                    onChange={(e) => setCourse(i, { credit: Number(e.target.value) })}
                    aria-label={`Course ${course.code} credit`}
                  />
                </td>
                <td className="py-2 text-xs text-muted">
                  {(ROLES_FOR_TYPE[course.type] ?? []).map((r) => ROLE_LABEL[r]).join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted">
        {programme.label}: continuous assessment out of {programme.caOutOf}, final out of{' '}
        {programme.finalOutOf}. This batch needs {batch.courses.length} courses in{' '}
        {slotCount} files.
      </p>
    </section>
  );
}