/**
 * Bengali (U+09E6) and Devanagari (U+0966) digit blocks.
 *
 * Several files in this corpus carry Bengali headers, and some were recovered
 * from a broken encoding. Getting this wrong makes a perfectly good numeric cell
 * read as blank.
 */
const DIGIT_ZERO = { bengali: 0x09e6, devanagari: 0x0966 };

const BENGALI_DIGITS = /[০-৯०-९]/g;
const BENGALI_TO_ASCII = (d) =>
  String(d).replace(
    BENGALI_DIGITS,
    (ch) => String(ch.charCodeAt(0) - (ch.charCodeAt(0) >= 0x09e6 ? DIGIT_ZERO.bengali : DIGIT_ZERO.devanagari)),
  );

/** Float guard: values are sums of two-decimal marks, so 1e-9 is far below real noise. */
export const EPSILON = 1e-9;

/**
 * Coerce a spreadsheet cell to a number.
 * Returns null for anything that is not unambiguously numeric, so that
 * "blank", "Absent", "" and "N/A" all mean the same thing downstream.
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = BENGALI_TO_ASCII(String(value))
    .replace(/[,\s ]/g, '')
    .replace(/[−–—]/g, '-');
  if (!/^-?\d*\.?\d+(e-?\d+)?$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Half-up rounding to `places`, free of the 1.005 -> 1.00 class of surprises. */
export function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor + (value >= 0 ? EPSILON : -EPSILON)) / factor;
}

/**
 * ROUNDUP as the university means it: always to the next whole mark.
 * Without the epsilon, 46 + 13/13 + 13.5/13.5 can land on 46.000000000000007
 * and round a perfect 46 up to 47.
 */
export function roundUp(value) {
  return Math.ceil(value - EPSILON);
}

/**
 * Canonical Student Id string.
 *
 * The corpus splits these across text and numeric cells (25 text / 28 numeric in
 * the golden workbook alone), so every comparison in the app goes through here.
 * Leading zeros are not preserved -- these are 8-digit ids without them.
 *
 * The string fallback deliberately refuses anything containing letters. Several
 * workbooks carry a date stamp such as "Submitted on 30/07/2026" on its own row;
 * digit-stripping that would invent an id ending 3072026 and, worse, duplicate it
 * on every such row.
 */
export function normalizeId(value) {
  const n = toNumber(value);
  if (n !== null && Number.isInteger(n)) return String(n);
  if (n !== null) return null;

  if (typeof value !== 'string') return null;
  const cleaned = BENGALI_TO_ASCII(value).trim();
  if (!/^[\d\s.\-]+$/.test(cleaned)) return null;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 5) return null;
  return String(Number(digits));
}

export function isUsableId(value) {
  const id = normalizeId(value);
  return id !== null && Number(id) > 0;
}

/** Display helper. Blank stays blank -- never render a gap as a zero. */
export function fmt2(value) {
  const n = toNumber(value);
  return n === null ? '' : n.toFixed(2);
}

export function sum(values) {
  let total = 0;
  for (const v of values) {
    const n = toNumber(v);
    if (n !== null) total += n;
  }
  return round(total, 6);
}