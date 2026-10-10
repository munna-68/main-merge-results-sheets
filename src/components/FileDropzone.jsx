import { useCallback, useRef, useState } from 'react';

const ACCEPT = '.xls,.xlsx';

export default function FileDropzone({ onFiles, busy, tone = 'default', children, compact }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);

  const handle = useCallback(
    (list) => {
      const files = [...(list ?? [])].filter((f) => /\.(xlsx?|xlsm)$/i.test(f.name));
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const border =
    tone === 'danger'
      ? 'border-danger/40 bg-dangerbg'
      : over
        ? 'border-ink bg-neutral-50'
        : 'border-line bg-paper hover:border-neutral-400';

  if (compact) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed px-3 py-2 transition-colors ${border}`}
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              handle(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="text-xs font-semibold underline underline-offset-2"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            Choose .xls / .xlsx
          </button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={`rounded-card border-2 border-dashed p-8 text-center transition-colors ${border}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = '';
        }}
      />
      {children}
      <button
        type="button"
        className="btn-primary mt-4"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? 'Reading…' : 'Choose files'}
      </button>
      <p className="mt-3 text-xs text-muted">
        Excel only (.xls, .xlsx). Everything is read in your browser — nothing is uploaded.
      </p>
    </div>
  );
}