import { COURSE_TYPES, ROLES } from '../model/courseTypes.js';
import { orderedCourses } from '../model/courseTypes.js';

const rolesFor = (type) => COURSE_TYPES[type]?.roles ?? [];

export default function SlotGrid({ courses, assignments, onAssign, onClear }) {
  const ordered = orderedCourses(courses);
  const roles = [...new Set(ordered.flatMap((c) => rolesFor(c.type)))];

  const total = ordered.reduce((n, c) => n + rolesFor(c.type).length, 0);
  const filled = [...assignments.keys()].length;
  const complete = filled === total;

  return (
    <section className="card p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">3 &middot; File assignment</h2>
          <p className="mt-1 text-sm text-muted">
            Files were placed automatically from their course code and role. Override anything
            that landed in the wrong slot.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            complete ? 'bg-okbg text-ok' : 'bg-warnbg text-warn'
          }`}
        >
          {filled} / {total} filled
        </span>
      </header>

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="label pb-2 pr-3 text-left">Course</th>
              {roles.map((role) => (
                <th key={role} className="label pb-2 pr-3 text-left">
                  {ROLES[role].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((course) => (
              <tr key={course.code} className="border-b border-line/60 align-top">
                <th scope="row" className="py-3 pr-3 text-left font-medium">
                  <span className="font-mono text-xs text-muted">MIS {course.code}</span>
                  <div className="text-sm">{course.title || COURSE_TYPES[course.type].label}</div>
                  <div className="text-xs text-muted">{course.credit} credits</div>
                </th>
                {rolesFor(course.type).map((role) => {
                  const key = `${course.code}::${role}`;
                  const file = assignments.get(key);
                  return (
                    <td key={role} className="py-3 pr-3">
                      {file ? (
                        <div className="rounded-lg border border-line bg-okbg px-2 py-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs leading-tight text-ink">{file.fileName}</span>
                            <button
                              type="button"
                              className="shrink-0 text-xs text-muted underline underline-offset-2"
                              onClick={() => onClear(key)}
                              aria-label={`Remove ${file.fileName}`}
                            >
                              x
                            </button>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted">
                            {file.count} students
                            {file.filenameCode && file.filenameCode !== course.code
                              ? ` · name says ${file.filenameCode}`
                              : ''}
                          </div>
                        </div>
                      ) : (
                        <label className="block cursor-pointer rounded-lg border border-dashed border-warn/50 bg-warnbg px-2 py-1.5 text-xs text-warn hover:border-warn">
                          <input
                            type="file"
                            accept=".xls,.xlsx"
                            className="hidden"
                            onChange={(e) => {
                              const [f] = e.target.files;
                              if (f) onAssign(key, f);
                              e.target.value = '';
                            }}
                          />
                          <span className="font-semibold underline underline-offset-2">
                            Missing — add file
                          </span>
                        </label>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}