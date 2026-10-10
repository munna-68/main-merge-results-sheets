/**
 * Course-code recognition.
 *
 * Preferred source is the file's own title block, not its name. The ASCII part
 * of `†Kvm© †KvW: MIS 3203` survives the mojibake intact, and that is exactly
 * what identifies `MIS 3103 Final.xlsx` as MIS 3203 -- its filename is wrong.
 */
const IN_TEXT = /MIS\s*[_\-–]?\s*(\d{4})/i;
/** Fallback for a bare four-digit code in a filename. */
const IN_NAME = /(?:^|[^0-9])(\d{4})(?:[^0-9]|$)/;

/** Scan the title block above the header row. */
export function fromTitleBlock(rows, headerIndex, limit = 12) {
  const scan = Math.min(limit, headerIndex > 0 ? headerIndex : rows.length);
  for (let r = 0; r < scan; r++) {
    const row = rows[r];
    if (!row) continue;
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const m = IN_TEXT.exec(cell);
      if (m) return m[1];
    }
  }
  return null;
}

export function fromFilename(name) {
  if (!name) return null;
  const base = String(name).replace(/\.[^.]+$/, '');
  const withPrefix = IN_TEXT.exec(base);
  if (withPrefix) return withPrefix[1];
  const bare = IN_NAME.exec(base);
  return bare ? bare[1] : null;
}

/**
 * What the file says about itself.
 *
 * `filenameCode` and `contentCode` are reported separately and are allowed to
 * disagree -- in this corpus one file has the filename wrong and two have the
 * title block wrong, so neither source can be trusted alone.
 */
export function detectCourse(row, matrix, headerIndex) {
  return {
    filenameCode: fromFilename(row?.name),
    contentCode: fromTitleBlock(matrix, headerIndex),
  };
}