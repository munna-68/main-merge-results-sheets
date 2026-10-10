# Main Merge Result Sheet

A browser app that merges per-course examination spreadsheets into a single `Main`
workbook — the exact file that [`result-sheet-gen`](https://github.com/) consumes to
produce the published result sheets.

Everything runs client-side. No server, no upload, no network call: student records never
leave the machine.

## What it does

1. Declare the batch — programme, year, semester, course count. Course codes derive
   automatically (`3201`…`3206`) and stay editable.
2. Drop in a **student master** (ID, name, registration, session) and every **course mark
   file**. Files auto-route into a visible slot grid; anything ambiguous is flagged rather
   than guessed at.
3. Review the computed result, then download one `.xlsx` containing a single `Main` sheet.

## Running it

```bash
npm install
npm run dev      # development server
npm run build    # production build into dist/
npm run preview  # serve the production build locally
npm test         # 53 tests, including a cell-for-cell golden comparison
```

Deploy to Vercel with no extra configuration: it detects Vite, runs `npm run build`, and
serves `dist/`.

## Why some things are the way they are

The short version: `result-sheet-gen` is 100% header-driven and **computes nothing**, and
it **hard-errors** when the programme implied by the column prefixes disagrees with the
user's own dropdown. Every awkward rule in here traces back to that.

The full reasoning — input contracts, the parser's list of known corpus defects, the
calculation rules, and the deviations we make on purpose — is in
[`project.md`](./project.md).

The shortlist:

- **Source totals are never trusted.** Every mark file's own total is discarded and
  recomputed from its question columns. The corpus contains a `=SUM(B:O)` that is exactly
  double the real total, and two `=SUM(C:G)` that omit a question. Disagreements surface
  as warnings; the recomputed value is used.
- **Role comes from the slot, not the file.** 1st- and 2nd-setter workbooks are
  structurally identical. The only thing that tells them apart anywhere is the file name.
- **Values, not formulas, by default.** The consumer reads with `raw: true`, and a
  formula written without a cached result arrives as a blank cell in a signed transcript.
  Formula mode is available and always attaches the cached value.
- **The student master is the roster.** A student absent from a mark file is reported, not
  dropped.

## Layout

```
src/
  model/     grade scale, column prefixes, course types, header aliases
  parse/     SheetJS reader, structural column detection, routing
  merge/     join identity + courses, compute
  write/     ExcelJS writer, styling, grade legend
test/
  fixtures/  inputs/ (18 course files + master), golden/ (reference output)
  golden.test.js, writer.test.js, courseTypes.test.js, parsers.test.js
reference/   output demo.xls — styling reference, not a test oracle
scripts/     one-time fixture authoring
```

## Known limitations

- Excel only (`.xls`, `.xlsx`). The two MIS 3201 Word files were converted once into
  committed fixtures; the app does not read Word.
- Improvement/re-sit students are handled manually by the department and are deliberately
  out of scope. All rows are sorted by Student Id.
- When `result-sheet-gen` asks where the courses start, enter a plain number (`3201`),
  not `3201, 3202, 3203`. It builds the printed labels itself and reads no course code
  from this file — a wrong number there mislabels every transcript.