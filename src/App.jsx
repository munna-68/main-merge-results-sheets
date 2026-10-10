import { useCallback, useMemo, useState } from 'react';

import BatchConfiguration from './components/BatchConfiguration.jsx';
import FileDropzone from './components/FileDropzone.jsx';
import MergePreview from './components/MergePreview.jsx';
import SlotGrid from './components/SlotGrid.jsx';
import StatusBar from './components/StatusBar.jsx';
import { defaultBatch } from './components/batchConfig.js';

import { buildModel } from './merge/buildModel.js';
import { parseMarksFile } from './parse/marksFile.js';
import { parseStudentMaster } from './parse/studentMaster.js';
import { routeFiles } from './parse/routing.js';
import { allSlots } from './parse/routing.js';
import { writeMainWorkbook } from './write/mainSheet.js';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default function App() {
  const [batch, setBatch] = useState(defaultBatch);
  const [master, setMaster] = useState(null);
  const [files, setFiles] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [cleared, setCleared] = useState([]);
  const [useFormulas, setUseFormulas] = useState(false);

  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState([]);
  const [downloading, setDownloading] = useState(false);

  const routed = useMemo(() => routeFiles(files, batch.courses), [files, batch.courses]);

  const assignments = useMemo(() => {
    const merged = new Map(routed.assignments);
    for (const [key, file] of Object.entries(overrides)) merged.set(key, file);
    for (const key of cleared) merged.delete(key);
    return merged;
  }, [routed.assignments, overrides, cleared]);

  const model = useMemo(
    () => (master ? buildModel({ config: batch, master, assignments }) : null),
    [batch, master, assignments],
  );

  const missing = useMemo(() => {
    const expected = allSlots(batch.courses);
    return expected
      .filter((slot) => !assignments.has(slot.key))
      .map((slot) => `${slot.course.code} · ${slot.role}`);
  }, [batch.courses, assignments]);

  const warnings = useMemo(
    () => [
      ...(master?.warnings ?? []),
      ...routed.warnings,
      ...files.flatMap((f) => f.warnings),
      ...(model?.warnings ?? []),
    ],
    [master, routed.warnings, files, model],
  );

  const onMaster = useCallback(async (list) => {
    const [file] = list;
    if (!file) return;
    setBusy('Reading the student master…');
    setErrors((e) => e.filter((x) => x.scope !== 'master'));
    try {
      setMaster(await parseStudentMaster(file));
    } catch (err) {
      setErrors((e) => [...e, { scope: 'master', ...err }]);
      setMaster(null);
    } finally {
      setBusy(null);
    }
  }, []);

  const onCourseFiles = useCallback(async (list) => {
    if (!list.length) return;
    setBusy(`Reading ${list.length} file${list.length === 1 ? '' : 's'}…`);
    const nextErrors = [];
    const parsed = [];
    for (const file of list) {
      try {
        parsed.push(await parseMarksFile(file));
      } catch (err) {
        nextErrors.push(err);
      }
    }
    setErrors((e) => [...e.filter((x) => x.scope !== 'file'), ...nextErrors]);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.fileName));
      return [...prev, ...parsed.filter((f) => !seen.has(f.fileName))];
    });
    setBusy(null);
  }, []);

  const onAssign = useCallback(async (key, file) => {
    setBusy('Reading that file…');
    try {
      const parsed = await parseMarksFile(file);
      setOverrides((o) => ({ ...o, [key]: parsed }));
      setCleared((c) => c.filter((k) => k !== key));
    } catch (err) {
      setErrors((e) => [...e, err]);
    } finally {
      setBusy(null);
    }
  }, []);

  const onClear = useCallback((key) => {
    setOverrides((o) => {
      const next = { ...o };
      delete next[key];
      return next;
    });
    setCleared((c) => (c.includes(key) ? c : [...c, key]));
  }, []);

  const reset = () => {
    setMaster(null);
    setFiles([]);
    setOverrides({});
    setCleared([]);
    setErrors([]);
    setUseFormulas(false);
  };

  const fileName = `${batch.programme} ${batch.year} ${batch.semester} Merged Result.xlsx`;

  const download = async () => {
    if (!model || missing.length) return;
    setDownloading(true);
    try {
      const { buffer } = await writeMainWorkbook({ model, useFormulas });
      const blob = new Blob([buffer], { type: XLSX_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const ready = Boolean(model) && missing.length === 0;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Main Merge Result Sheet</h1>
            <p className="mt-1 text-sm text-muted">
              Merge per-course mark files into one <code className="font-mono">Main</code>{' '}
              workbook for result-sheet-gen.
            </p>
          </div>
          <button type="button" className="btn-quiet" onClick={reset}>
            Start over
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <BatchConfiguration batch={batch} onChange={setBatch} locked={Boolean(master)} />

        <section className="card p-6">
          <header className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">2 &middot; Files</h2>
            <p className="mt-1 text-sm text-muted">
              The student master decides who appears on the sheet. Drop every course file at
              once — they sort themselves into slots.
            </p>
          </header>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="label mb-2">Student master</p>
              {master ? (
                <div className="rounded-lg border border-ok/30 bg-okbg px-3 py-2.5">
                  <p className="text-sm font-medium">{master.fileName}</p>
                  <p className="mt-0.5 text-xs text-ok">
                    {master.count} students from sheet &ldquo;{master.sheetName}&rdquo;
                  </p>
                </div>
              ) : (
                <FileDropzone onFiles={onMaster} busy={busy?.startsWith('Reading the student')}>
                  <p className="text-sm font-medium">No student master yet</p>
                  <p className="mt-1 text-xs text-muted">
                    Needs a Student ID, Name, Registration and Session column.
                  </p>
                </FileDropzone>
              )}
              {master && (
                <div className="mt-2">
                  <FileDropzone compact onFiles={onMaster} busy={busy}>
                    <span className="ml-3 text-xs text-muted">Replace</span>
                  </FileDropzone>
                </div>
              )}
            </div>

            <div>
              <p className="label mb-2">Course mark files</p>
              <FileDropzone onFiles={onCourseFiles} busy={busy?.startsWith('Reading')}>
                <p className="text-sm font-medium">
                  {files.length
                    ? `${files.length} course file${files.length === 1 ? '' : 's'} read`
                    : 'Drop the course files here'}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Continuous, 1st setter and 2nd setter for each regular course.
                </p>
              </FileDropzone>
              {files.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {files.map((f) => (
                    <li
                      key={f.fileName}
                      className="rounded-full border border-line bg-neutral-50 px-2.5 py-1 text-[11px]"
                    >
                      {f.fileName}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <StatusBar errors={errors} warnings={warnings} />

        {busy && <p className="text-sm text-muted">{busy}</p>}

        {batch.courses.length > 0 && (files.length > 0 || Object.keys(overrides).length > 0) && (
          <SlotGrid
            courses={batch.courses}
            assignments={assignments}
            onAssign={onAssign}
            onClear={onClear}
          />
        )}

        {model && <MergePreview model={model} />}

        <section className="card p-6">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-neutral-300"
              checked={useFormulas}
              onChange={(e) => setUseFormulas(e.target.checked)}
            />
            <span>
              <span className="text-sm font-medium">Write formulas instead of plain numbers</span>
              <span className="mt-0.5 block text-xs text-muted">
                Handy for auditing the arithmetic. Every formula is written with its result
                cached, so downstream readers still see values rather than blanks.
              </span>
            </span>
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="btn-primary"
              disabled={!ready || downloading}
              onClick={download}
            >
              {downloading ? 'Building…' : `Download ${fileName}`}
            </button>
            {!master && <span className="text-sm text-muted">Add a student master to continue.</span>}
            {master && missing.length > 0 && (
              <span className="text-sm text-warn">
                {missing.length} slot{missing.length === 1 ? '' : 's'} still missing:{' '}
                {missing.slice(0, 4).join(', ')}
                {missing.length > 4 ? ', …' : ''}
              </span>
            )}
          </div>

          <p className="mt-4 text-xs text-muted">
            When result-sheet-gen asks where the courses start, enter the first course code as a
            plain number &mdash; <strong>3201</strong>, not <strong>3201, 3202, 3203</strong>.
            It builds the printed labels itself, and a wrong number here mislabels every
            transcript.
          </p>
        </section>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted">
          Runs entirely in your browser. No file ever leaves this machine.
        </p>
      </footer>
    </div>
  );
}