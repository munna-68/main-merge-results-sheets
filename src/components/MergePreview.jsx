import { SGPA_COLUMN } from '../model/courseLayout.js';

const PREVIEW_COLUMNS = 12;

/**
 * Review-before-download is not optional here: the output is a file that feeds a
 * document carrying a Controller of Examinations' signature, and a user is about
 * to merge 53 students x 6 courses by hand otherwise.
 */
export default function MergePreview({ model }) {
  const { header, rows, courses } = model;

  // Total / grade / letter per course: enough to audit a merge without
  // scrolling through 78 columns.
  const shown = ['SL No', 'Student Id', 'Name', 'Reg', 'Session'];
  for (const result of courses) {
    for (const token of ['ST', 'GT', 'LG']) {
      const name = `${token}_${result.course.code}`;
      if (header.includes(name)) shown.push(name);
    }
  }
  shown.push(SGPA_COLUMN);

  const at = (row, name) => {
    if (name in row.identity) return row.identity[name];
    if (name === SGPA_COLUMN) return row.sgpa;
    for (const cells of row.courseCells) if (name in cells) return cells[name];
    return null;
  };

  const cellText = (value, name) => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value !== 'number') return String(value);
    return name === 'SL No' ? String(value) : value.toFixed(2);
  };

  const blank = rows.filter((r) => r.missingSomewhere).length;

  return (
    <section className="card p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">4 &middot; Review</h2>
          <p className="mt-1 text-sm text-muted">
            {rows.length} student{rows.length === 1 ? '' : 's'} &middot; {header.length} columns
            &middot; sorted by Student Id
            {blank > 0 ? ` · ${blank} with a blank course` : ''}
          </p>
        </div>
      </header>

      <div className="overflow-x-auto scroll-thin rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="bg-neutral-50">
            <tr>
              {shown.map((name) => (
                <th key={name} className="whitespace-nowrap border-b border-line px-2 py-2 text-left font-semibold">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PREVIEW_COLUMNS).map((row) => (
              <tr key={row.studentId} className="border-b border-line/50">
                {shown.map((name) => {
                  const value = at(row, name);
                  const failed = typeof value === 'string' && value === 'F';
                  return (
                    <td
                      key={name}
                      className={`whitespace-nowrap px-2 py-1.5 ${
                        name === 'Name' ? 'font-medium' : ''
                      } ${typeof value === 'number' ? 'text-right' : ''} ${
                        failed ? 'font-semibold text-danger' : ''
                      }`}
                    >
                      {cellText(value, name)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > PREVIEW_COLUMNS && (
        <p className="mt-2 text-xs text-muted">
          Showing the first {PREVIEW_COLUMNS} of {rows.length} rows. The download contains all of
          them.
        </p>
      )}
    </section>
  );
}