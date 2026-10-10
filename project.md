# Main Merge Result Sheet

A client-side web app that merges per-course examination spreadsheets into a single
consolidated `Main` workbook — the exact input format that
[`result-sheet-gen`](https://github.com/) consumes to produce the published PDF/DOCX
result sheets.

**Status:** spec approved, implementation not started.

---

## 1. Purpose

Today the department merges ~18 spreadsheets (6 courses × 3 roles) by hand into a wide
`Main` sheet, then feeds that file to a second app. This app automates step one.

### In scope

- Client-side merge of continuous-assessment, 1st-setter and 2nd-setter mark files.
- BBA and MBA programmes, any year/semester, any course count (5–8+).
- Regular, viva, and internship/thesis course types.
- Identity enrichment from a student-master file (Name / Registration / Session).
- A single styled `.xlsx` with one sheet named `Main`.

### Out of scope (explicit)

- **Improvement / re-sit students.** Dropped by decision. The department handles these
  manually outside this tool. There is no flag, column, styling, or code path.
- Any change to `result-sheet-gen`. This app produces a file; what happens downstream is
  that app's concern.
- `.docx` / `.pdf` input. **Excel only** (`.xls`, `.xlsx`).
- PDF/DOCX generation, grade computation audit trails, cloud sync, auth, multi-user state.

---

## 2. Two hard constraints inherited from the consumer

Every design decision below traces back to one of these.

**Constraint A — the consumer is 100% header-driven and computes nothing.**
It reads a sheet literally named `Main`, treats row 1 as a flat header, and accepts a
row as a student iff its Student-Id cell parses to a finite number `> 0`. Everything
structural — course count, course order, course type, credits, programme — is derived
from the header row alone. It has **zero** knowledge of year or semester.

**Constraint B — the consumer hard-errors on programme mismatch.**
It infers BBA vs MBA from which prefix family it finds (`AP_/M1_/M2_` vs
`A_/CT_/P_/MS_`) and throws if that disagrees with the user's own dropdown. Getting the
programme wrong means the file is rejected outright, not degraded.

---

## 3. Architecture

100% client-side. No server, no backend, no network calls. Student PII never leaves the
user's machine — this is the argument that gets the tool signed off.

Mirrors `result-sheet-gen` so the two apps are visually and behaviourally identical.

| Concern | Choice |
|---|---|
| Build | Vite 5 |
| Framework | React 18 (function components + hooks, no router, no state library) |
| Styling | Tailwind 3.4, stock config |
| Font | `@fontsource/ibm-plex-sans` (400/500/600/700), self-hosted |
| Read Excel | SheetJS `xlsx@0.18.5` — reads BIFF8 `.xls` and OOXML `.xlsx` |
| Write Excel | `exceljs` — the only mature browser writer with styling + conditional formatting |
| Tests | Vitest 2 (node environment, no jsdom) |
| Deploy | Vercel (auto-detects Vite; `dist/` output, `base: "/"`) |

**Why two Excel libraries.** SheetJS community edition cannot *write* cell styling at
all. `exceljs` cannot read `.xls`. Reading is delegated to SheetJS, writing to exceljs.
Both are dynamically imported so neither lands in the initial bundle.

**Constants are copied, not imported.** `result-sheet-gen` is a separate repo with no
package linkage. The shared constants (grade table, prefix maps, header names) are copied
into `src/model/` with a provenance comment pointing at their source file. This is a
deliberate, tracked duplication — see §12.

---

## 4. Module layout

```
src/
  main.jsx
  index.css
  App.jsx                     orchestration + all state
  components/
    BatchConfiguration.jsx     programme, year, semester, course table
    FileDropzone.jsx           free-form drop zone (auto-routing)
    SlotGrid.jsx               course × role grid; empty slot = hard block
    StudentMasterUpload.jsx    identity file dropzone
    OptionsToggles.jsx         recompute / formula mode
    MergePreview.jsx           computed-result table before download
    StatusBar.jsx              errors + warnings
  model/
    gradeScale.js              grade bands, marks -> GP / LG
    courseLayout.js            BBA/MBA component prefixes, column order
    courseTypes.js             regular | viva | internship (incl. thesis)
    identityHeaders.js         accepted header names + normaliser
  parse/
    workbook.js                SheetJS read helpers
    sheetPicker.js             choose the data sheet by shape, not by name
    headerRow.js               locate the header row in a drifting title block
    marksFile.js               continuous / setter / viva / thesis parsers
    studentMaster.js           identity file parser
    courseIdentity.js          regex course code from title block
  merge/
    buildModel.js              join identity + 6 courses -> student rows
    compute.js                 ST, AVG, GT, GP, EC, LG, SGPA
  write/
    mainSheet.js               exceljs writer, Main sheet only
    styling.js                 fonts, widths, number formats, fills
    gradeLegend.js             the Marks/GP/LG lookup table
  utils/
    warnings.js                warning codes + formatting
    numbers.js                 parse / round / format
```

---

## 5. Input contracts

There are **four** distinct input kinds. All are `.xls` / `.xlsx`.

### 5.1 Student master (required, exactly one)

One row per student. Supplied separately because the mark files carry only an ID.

| Column | Accepted header names | Notes |
|---|---|---|
| Student Id | `ID`, `Student ID` | required; the join key |
| Name | `Name`, `Student Name`, `Student's Name`, `Name of Student` | |
| Registration | `Reg`, `Reg.`, `Reg No`, `Reg. No`, `Registration`, `Registration No`, `Registration Number` | text, zero-padded |
| Session | `Session`, `Academic Session` | per-student |

Header matching is case- and punctuation-insensitive: lowercase, then strip every
character that is not `a-z0-9`. `Reg. No` → `regno`; `Reg No` → `regno`; `Student Id` →
`studentid`. Only the **first** matching column per field is used.

Unknown extra columns are ignored silently. `SL No` and `CGPA` are recognised names and
never trigger a warning.

### 5.2 Course mark files

Six proven templates. **Parse by shape, never by filename** — filenames and sheet names in
this corpus are unreliable (`MIS 3103 Final.xlsx` is internally MIS 3203; three files sit
on a sheet named `MIS 3106`; the MBA thesis data sheet is named `2202`).

**Sheet selection.** Pick the sheet whose header row resolves to a usable ID column plus
≥1 mark column. Never `Sheet1` — every file in this family carries a stray course-credit
table there.

**Header row location.** Scan rows 1–15 for the row that yields a usable ID column. The
header row drifts between rows 5, 7, 9 and 10 across templates, and one file inserts a
title block with the header at row 7.

**ID column.** Match `ID` / `Id no` / `Id No.` / `আইডি নম্বর` (the Bengali-headered files
decode correctly — SheetJS reads them fine). Fall back to the first column that parses as
a positive number.

**Mark columns.** Every numeric column after the ID column and before the total column.
Columns that are blank for *every* student are excluded (this correctly drops `Q7` in
`MIS 3201 Final` and `Q7`–`Q13` in `MIS 3103 Final`).

**Total column.** Located but **never trusted** — see §5.3.

**Role assignment** is determined by the **slot the file was dropped into**, not by its
content. The 1st-setter and 2nd-setter files are structurally identical (same 8-row title
block, same `1..6` question headers, same `Total (60%)`); the only distinguishing signal
anywhere in the corpus is the word in the filename. Content-based role detection is
therefore impossible, and slot-based assignment removes the problem entirely.

#### The three roles, proven

Verified against the golden workbook: **22 file→role assignments, 1,066 field comparisons,
0 unexplained mismatches.**

| Role | Produces | Verified against |
|---|---|---|
| Continuous | `ST_xx` (sum of 4 components) | 6/6 courses, 53/53 students each |
| 1st setter | `F1_xx` (sum of question marks) | 6/6 courses, 53/53 students each |
| 2nd setter | `F2_xx` (sum of question marks) | 6/6 courses, 53/53 students each |

### 5.3 The recompute rule — totals are never trusted

Every mark file's own total is **discarded** and recomputed as the sum of its question
columns. Two real defects make this mandatory:

| Defect | Consequence if trusted |
|---|---|
| `MIS 3206 1st setter.xls` and `MIS 3206 2nd setter.xlsx` total with `=SUM(C:G)` — omits question 6 | every MIS 3206 total under-reported |
| `MIS 3103 Final.xlsx` column `P` is `=SUM(B:O)` | **exactly 2× the true total** on all 51 cached rows; blank on 2 more |

When our recomputed total disagrees with the file's stated total, emit a warning naming
the file, column and both values. **Never block on a numeric disagreement** — block only
on missing files.

Toggle: *Use totals as stated in each file* is available but off by default.

### 5.4 Viva and internship/thesis files

Proven shapes, both plain Detailed-Marksheet layouts:

| Source | Columns | Maps to |
|---|---|---|
| `Viva …xlsx` | `SL NO \| ID \| Total (100%)` | one mark, no breakdown |
| `MBA …Thesis….xlsx` | `SL NO \| ID \| Thesis/Research Report(70%) \| Presentation(30%) \| Total(100%)` | `IR`, `IRD`, `GT` |

The thesis file maps **exactly** onto the consumer's internship/thesis contract — a
structural match, not a coincidence.

**Viva output shape.** The source has a single mark, so emit the full marker group
`V1 V2 V3 V4` with the mark in `GT`, leaving V1–V4 blank. This matches the department's
own 4-2 workbook. The consumer ignores V1–V4 entirely and reads only `GT`, so the
printed transcript is identical to any alternative encoding — we simply never fabricate
marks we were not given. **Do not reject a viva file for having one mark column.**

Internship vs thesis is **not** a user choice. The consumer labels a single
internship-typed course `Internship` under BBA and `Thesis` under MBA, automatically, from
the programme setting.

### 5.5 Course identity

Extracted from each file's own title block by regex `MIS\s*(\d{4})`. This survives
recovered mojibake because the ASCII portion is intact — it is what correctly identifies
`MIS 3103 Final.xlsx` as MIS 3203. Filename is a fallback and a cross-check only.

Mismatches between detected and expected course produce a **warning**, not an error.

---

## 6. Course-code scheme

`YYSSCC`, zero-padded:

| Example | Meaning |
|---|---|
| `1101` | year 1, semester 1, course 1 |
| `1201` | year 1, semester 2, course 1 |
| `3204` | year 3, semester 2, course 4 |
| `4207` | year 4, semester 2, course 7 (viva) |
| `5207` | MBA 2nd semester, thesis |

The batch config takes **Programme + Year + Semester + Course count** and derives
`YYSS01…YYSSnn` automatically — a fast path for the common case. The derived list renders
as an **editable table**, because derivation cannot know about a dropped course, a swapped
code, or a non-standard credit. The editable table is also where per-course credit and
course type are set.

`YY` is a running year index, **not** a BBA-only counter: the university's own viva file
is titled `Course Code: MIS 4207 or 5206`, serving BBA 4-2 and MBA 2nd semester from one
sheet. Never assume years 1–4.

### Suffix in `Main`

The header suffix is the real course code — `CA_3201`, `F1_3201`, `GT_3201`, not `01`.
This makes the output self-describing for a human auditing it in Excel.

The consumer groups columns by suffix and orders courses by left-to-right column position.
It never reads a course code from the file; it synthesises printed codes from a number the
user types into *its own* UI. **Consequence:** putting real codes in the suffix does **not**
automatically make the consumer print them. A user entering `4201` gets `MIS 4201…MIS 4206`
printed; entering `1` gets `MIS 1…MIS 6`. This is a known footgun for the department and
should be called out in the app's UI.

Column order in `Main`: regular courses ascending by code, then viva, then
internship/thesis.

---

## 7. Computation

```
ST   = CA + AP + M1 + M2                    (BBA, out of 40)
ST   = CA + A + CT + P + MS                  (MBA, out of 60)
AVG  = (F1 + F2) / 2                         unrounded
GT   = ROUNDUP(ST + AVG, 0)                  out of 100
GP   = gradeScale.lookup(GT).gradePoint
LG   = gradeScale.lookup(GT).letterGrade
EC   = GP * credit
SGPA = ROUND( SUM(GP * credit) / SUM(credit), 2 )
```

### Blank semantics

A blank source cell is **written as blank**; the computed chain treats it as `0`. This
exactly reproduces `output demo.xls`, where student `12022062` has blank `F1_01`/`F2_01`,
an explicit `AVG_01` of `0.0`, `GT_01` of 4.0 (CA-only) and `LG_01` of `F`.

A blank `F1` must **never** become a fabricated average. Under the hard block (§9) this
cannot arise for a missing *file*, but it can for a missing *cell*, and the chain must
degrade the way the original workbook does — not invent a pass.

### SGPA denominator

`SUM(credit)` over **all** courses in the sheet, including failed ones. This is what the
corpus does: `12022062` earns 3 credits but her SGPA is `0.46 = (2.75 × 3) / 18`. The
consumer divides by nothing — it reads our value verbatim.

### Grade scale — hardcoded

One scale, both programmes. Confirmed identical in three independent places:
`result-sheet-gen/src/utils/gradeTable.js`, `output demo.xls!L82:P92`, and the published
PDF legend.

| Marks | GP | LG | | Marks | GP | LG |
|---|---|---|---|---|---|---|
| ≥ 80 | 4.00 | A+ | | ≥ 55 | 2.75 | B- |
| ≥ 75 | 3.75 | A | | ≥ 50 | 2.50 | C+ |
| ≥ 70 | 3.50 | A- | | ≥ 45 | 2.25 | C |
| ≥ 65 | 3.25 | B+ | | ≥ 40 | 2.00 | D |
| ≥ 60 | 3.00 | B | | < 40 | 0.00 | F |

Plus `I` (Incomplete) and `W` (Withdrawn), which appear in the printed legend only.

**Hardcoded, not configurable.** Three copies already agree, and this scale is what a
Controller of Examinations signs against. Making it editable invites someone to "fix" it
in a semester of hurry.

### Credits

Per-course, default **3**, editable in the course table. `EC = GP × credit` must hold,
because the consumer derives each course's credit as the **median of `EC ÷ GP`** across
students and falls back to 3 only when nothing is usable. Correct input → correct
derivation; wrong input → silently wrong "Credit Point" printed on every transcript.

---

## 8. Output contract

One sheet, literally named `Main`. Header on row 1, students from row 2.

### 8.1 Header row

```
SL No | Student Id | Name | Reg | Session
  then, per regular course (BBA, 12 cols):
    CA_3201  AP_3201  M1_3201  M2_3201  ST_3201  F1_3201  F2_3201  AVG_3201  GT_3201  GP_3201  EC_3201  LG_3201
  then, per regular course (MBA, 13 cols):
    CA_xxxx  A_xxxx  CT_xxxx  P_xxxx  MS_xxxx  ST_xxxx  F1_xxxx  F2_xxxx  AVG_xxxx  GT_xxxx  GP_xxxx  EC_xxxx  LG_xxxx
  then, if present:
    V1 V2 V3 V4  GT_xxxx  GP_xxxx  EC_xxxx  LG_xxxx
    IR IRD       GT_xxxx  GP_xxxx  EC_xxxx  LG_xxxx
  then:
    SGPA
```

`SL No` is included. It is absent from `output demo.xls` but present in the department's
current 3,2 and 4-1 workbooks, and the consumer ignores it.

`SGPA` is last. The consumer finds it **by name**; position is not required, but if it
were ever missing it would silently read the last data column instead — so it is always
emitted.

### 8.2 Literal values, not formulas — by default

`output demo.xls` carries 2,314 live formulas. We do not, by default.

**Technical reason.** `exceljs` writes `<f>` with no cached `<v>` unless a `result` is
supplied explicitly. The consumer reads with `raw: true`, so a formula cell with no
cached value arrives as `null` → `NaN` → **blank cell in a published transcript**. A
single forgotten cached value silently publishes a missing mark.

Formula mode is available behind a toggle. When selected, every formula is written with
its computed result attached, and the UI states this plainly.

### 8.3 Cell typing and number formats

| Column | Storage | Format | Rationale |
|---|---|---|---|
| `SL No` | number | `General` | |
| `Student Id` | **text** | `@` | source files split 25 text / 28 numeric; normalising to text removes the inconsistency. Both readers handle either. |
| `Name`, `Reg`, `Session` | text | `@` | `Reg` must keep its leading zeros |
| all numeric mark cells | number | `0.00` | |
| `LG_*` | text | `General` | |
| `SGPA` | number | `0.00` | |

Full float precision is written; `0.00` is display only. The golden workbook stores
`31.259999999999998` and displays `31.26` — the test harness compares with tolerance, not
string equality.

### 8.4 Styling — parity with the golden workbook

Target is `3,2 Result-2025 (2022-2023) Detailed sheet.xls` (the current, correct
evolution of `output demo.xls`), and `output demo.xls` for anything the golden lacks.

| Property | Value |
|---|---|
| Header font | Times New Roman 10pt bold |
| Data font | Arial 10pt; `Name` and `SGPA` in Times New Roman 10pt bold |
| Gridlines | hidden |
| Column widths | `SL No` 9.2 · `Student Id` 11.5 · `Name` 27.7 · `Reg` 13.5 · `Session` 10.7 · body 8.4–10.7 |
| Freeze panes | none (matches source workbooks) |
| Data validation | none |
| Autofilter | none |

### 8.5 Grade legend table

Below the data, at **header row = last data row + 8**. Reproduces the
`Marks | GP | … | LG` band table so the department can audit the scale against the file.
11 rows (1 header + 10 bands) across a 5-column footprint, values in columns 1, 2 and 5.

### 8.6 Conditional formatting

One rule: flag class attendance **below 3.5** — applied to **all** CA columns.

**Documented deviation.** `output demo.xls` applies this rule to `CA_02`–`CA_05` only,
silently skipping `CA_01` and `CA_06`. Reproducing that exactly would ship an attendance
alarm that ignores a third of the courses. Flagging consistently is a deliberate break
from byte-parity; it changes no cell value and is allowlisted in the golden test.

### 8.7 What is deliberately NOT in the output

- No `CGPA` column — empty in all 318 rows of the published transcript, and unread by the
  consumer.
- No `3RD EXAM CHEECK` sheet — excluded from scope.
- No `Summary` sheet — excluded from scope.
- No extra or helper columns of any kind. An unrecognised header makes the consumer emit
  an `unknown-columns` warning, so decoration in the header row is actively harmful.

---

## 9. Validation

### Hard block on missing files

Generation is refused until **every** slot in the grid is filled. This is a firm product
decision, not a warning. An incomplete merge is worse than no merge: a department that
cannot see which file is absent will happily publish a result sheet with blank columns
that look like real zeros.

The consumer renders a blank as an empty cell and a zero as `0.00`. Those are
indistinguishable on a published transcript, so a silent gap is a silent data error.

### Warning (non-blocking)

- Recomputed total ≠ stated total in a source file.
- Detected course ≠ slot course.
- Student in a mark file but absent from the student master.
- Student in the master but absent from every mark file for some course.
- Duplicate Student Id within one file, or within the master.
- More than one file routed to a single slot.
- Slot empty but a file is present that no slot accepts.
- A cell value outside its component's maximum (e.g. `CA` above 5).

### Row set

**The student master is the roster.** Every master row produces one `Main` row. A student
found in mark files but absent from the master is reported and **excluded** — the
enrolment list is authoritative.

### Row order

Ascending by Student Id, single group, `SL No` = 1…N.

---

## 10. UI

Three stages, mirroring `result-sheet-gen`'s monochrome editorial language (IBM Plex
Sans, white canvas, `rounded-2xl` hairline cards, `bg-black` pill buttons).

1. **Batch configuration** — Programme select, Year, Semester, Course count → editable
   course table (code, type, credit). Course codes derive automatically.
2. **Inputs** — one free-form drop zone that auto-routes every dropped file into a visible
   `course × role` slot grid, plus a separate student-master dropzone. Auto-routing gives
   the "dump everything at once" ergonomics; the slot grid makes a missing file a
   structurally *visible* state. Both, deliberately.
3. **Review & export** — computed-result preview table, the two toggles, and the download
   button (disabled until every slot is filled).

Warnings and errors render inline in a `StatusBar`, using `result-sheet-gen`'s existing
warning-code vocabulary and presentation. No toast library.

**Preview is not optional.** A user is merging 53 students × 6 courses into a file that
feeds a document carrying a Controller of Examinations' signature. They see the computed
result before they commit to it.

### Persistence

None. Stateless, matching `result-sheet-gen`.

---

## 11. Testing

**Golden test.** The app must reproduce
`3,2 Result-2025 (2022-2023) Detailed sheet.xls` cell-for-cell for all 53 students and 6
courses. That workbook is the department's own output for this exact batch and matches
the published DOCX across 3,869 comparisons with 7 discrepancies, all IEEE-754 display
artefacts on `ST_01`.

Two adjustments, both deliberate:

1. **Match by Student Id, not by row position.** The golden file appends 4 earlier-session
   students at rows 51–54; pure ascending order places them first. Row order will differ;
   every value is identical.
2. **Allowlist the conditional-format range difference** (§8.6).

All 53 students are reproducible from source. The two Word files are converted to Excel
and verified against the golden file before use.

### Fixtures

| Fixture | Origin |
|---|---|
| 18 course input files | the repo's 16 Excel files + 2 authored from the Word files |
| `3,2 … Detailed sheet.xls` | the golden output, kept verbatim |
| viva file, thesis file | kept; exercise the total-only parsers |
| `output demo.xls` | style reference; not a test oracle |
| student master | authored from the 53 identities in the published DOCX |

Synthetic fixtures are written for every parser trap (§12) so regressions are caught by
unit tests, not by the golden run.

### Coverage the golden test cannot give

Viva and internship/thesis output, MBA column layout, and multi-block sheets all need
their own synthetic fixtures. Their source data is template-stubbed (44 of 53 vivas are
exactly `54`; 45 of 53 theses exactly `67`), so the real files prove *shape* only.

---

## 12. Known defects in the source corpus

Every one of these is handled, and each has a dedicated test.

| # | Defect | Handling |
|---|---|---|
| 1 | `MIS 3103 Final.xlsx` column `P` is `=SUM(B:O)` — exactly 2× the true total on all 51 cached rows | never read; recompute from `B:N` |
| 2 | `MIS 3203 1st Continous.xls` has **two stacked data blocks** (37 + 16 = 53) with a repeated header between | repeated header blocks are detected and concatenated; a single-block reader silently drops 16 students |
| 3 | ID columns **mix text and numbers** (25 text / 28 numeric in the golden file; same in viva and thesis) | normalised before any comparison, or you get 28 phantom mismatches |
| 4 | Question columns exist but are **entirely blank** for every student (`Q7` in `MIS 3201 Final`; `Q7`–`Q13` in `MIS 3103 Final`) | excluded by all-blank detection |
| 5 | Sheet names are meaningless — `MIS 3106`, `2202` on an MBA-5-2 file | sheet chosen by shape |
| 6 | Every file carries a stray `Sheet1` course-credit table | excluded by shape |
| 7 | Header row position drifts across rows 5, 7, 9, 10 | located by scan |
| 8 | Two files have Bengali headers (one has the wrong department in its title) | `আইডি নম্বর` matches the ID alias list; department line is ignored |
| 9 | `MIS 3206` files total with `=SUM(C:G)`, omitting question 6 | recompute, never trust |
| 10 | `Continuous MIS 3206.xlsx` has a second sheet of MID-2 marks | shape selection |

---

## 13. Repo layout

```
/                        Vite app
test/fixtures/inputs/    18 course files + student master
test/fixtures/golden/    3,2 Result-2025 (2022-2023) Detailed sheet.xls
test/fixtures/courses/   viva + thesis files
test/fixtures/traps/     synthetic defect fixtures (§12)
reference/               output demo.xls
```

### File disposition

**Keep** — 16 course Excel files, `3,2 … Detailed sheet.xls`, `output demo.xls`, and the
two untracked viva/thesis files.

**Author from existing** — the two 3201 Word files converted to `.xlsx`; a student-master
file built from the 53 identities in the published DOCX.

**Delete** — all 6 files below. Every one is git-tracked, so this is recoverable.

| File | Reason |
|---|---|
| `MIS 3201 Continous.docx`, `MIS 3201 Final.docx` | converted; both proven at 53/53 against the golden file |
| `3rd Year 2nd Semester Final Result-2025 (1).docx` | published transcript; source for the master fixture, and the golden `.xls` is the better oracle |
| `3rd Year 2nd Semester Final Result-2025 (1).pdf` | print of the above |
| `3,2 Result-2025 (2022-2023) Detailed sheet.pdf` | print of the golden `.xls` |
| `bazar-slip-2026-09-29.pdf` | a Bengali vegetable-market rate slip from the university canteen. Not exam data. |

---

## 14. Open items

None blocking. Carried forward for awareness:

- **The `startingCourseNumber` footgun in `result-sheet-gen`.** Printed course codes are
  synthesised from a number typed into *that* app, not read from our suffix. A user who
  types `1` gets `MIS 1…MIS 6` on a transcript for MIS 3201–3206. Out of scope to fix
  here; the app's UI should warn.
- **Tracked duplication of constants** with `result-sheet-gen` (§3). If that app changes
  its grade table or header aliases, this one drifts. Worth a periodic diff.
- **Viva and thesis source data is template-stubbed** (§11). The parsers are proven against
  shape only; the first real batch will validate the values.