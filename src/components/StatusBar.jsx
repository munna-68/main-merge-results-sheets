export default function StatusBar({ errors, warnings }) {
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div className="rounded-card border border-danger/30 bg-dangerbg p-4">
          <h3 className="text-sm font-semibold text-danger">
            {errors.length} file{errors.length === 1 ? '' : 's'} could not be read
          </h3>
          <ul className="mt-2 space-y-1.5">
            {errors.map((e, i) => (
              <li key={i} className="text-xs leading-relaxed text-danger">
                <span className="font-semibold">{e.message}</span>
                {e.detail ? <span className="block opacity-80">{e.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <details className="rounded-card border border-warn/30 bg-warnbg p-4" open>
          <summary className="cursor-pointer text-sm font-semibold text-warn">
            {warnings.length} thing{warnings.length === 1 ? '' : 's'} worth checking
          </summary>
          <ul className="mt-2 space-y-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-xs leading-relaxed text-warn">
                <span className="font-semibold">{w.message}</span>
                {w.detail ? <span className="block opacity-80">{w.detail}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}