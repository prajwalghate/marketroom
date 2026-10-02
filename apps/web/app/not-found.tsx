import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mr-container" style={{ padding: '72px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 'var(--mr-text-2xl)', margin: '0 0 10px', fontWeight: 600 }}>
        Market not found
      </h1>
      <p style={{ color: 'var(--mr-text-muted)', margin: '0 0 22px' }}>
        That ticker is not in the index. It may have been delisted, or never listed.
      </p>
      <Link href="/" className="mr-btn mr-btn-primary" style={{ textDecoration: 'none' }}>
        Browse all markets
      </Link>
    </div>
  );
}
