'use client';

/**
 * Route error boundary.
 *
 * An upstream venue failing should degrade one route, not blank the app.
 */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mr-container" style={{ padding: '72px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 'var(--mr-text-xl)', margin: '0 0 10px', fontWeight: 600 }}>
        Market data unavailable
      </h1>
      <p
        style={{
          color: 'var(--mr-text-muted)',
          margin: '0 0 22px',
          maxWidth: '52ch',
          marginInline: 'auto',
        }}
      >
        We could not reach the venue APIs. This is usually temporary — the data sources are public
        endpoints with no uptime guarantee.
      </p>
      <button type="button" className="mr-btn mr-btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
