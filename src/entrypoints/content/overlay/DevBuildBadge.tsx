const buildTimestamp = new Date(__GPK_BUILD_TIMESTAMP__)

const formattedBuildTimestamp = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
}).format(buildTimestamp)

export function DevBuildBadge() {
  if (!import.meta.env.DEV) {
    return null
  }

  return (
    <div
      aria-label={`Development build: ${formattedBuildTimestamp}`}
      style={{
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        zIndex: 2147483647,
        pointerEvents: 'none',
        padding: '3px 6px',
        borderRadius: '4px',
        background: 'rgba(185, 28, 28, 0.9)',
        color: 'white',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '10px',
        fontWeight: 600,
        lineHeight: 1.2,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
      }}
    >
      DEV · {formattedBuildTimestamp}
    </div>
  )
}
