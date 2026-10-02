'use client';

import { VisuallyHidden } from '@marketroom/ui';
import { useState } from 'react';

/**
 * An on-chain address, shown in full-ish and copyable.
 *
 * This is the most useful anti-impersonation control the product can offer. On
 * a permissionless chain anyone can mint a token called `NVDAx`; only one
 * address is the issuer's. A reader who can copy the address and check it
 * against the issuer or an explorer is verifying rather than trusting us.
 *
 * Truncated in the middle rather than the end: the last characters are what
 * people actually compare when checking an address, so cutting them off would
 * defeat the purpose.
 */
export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the full address is in the `title`
      // and selectable either way, so there is still a path to it.
    }
  };

  const short = address.length > 16 ? `${address.slice(0, 7)}…${address.slice(-6)}` : address;

  return (
    <button type="button" className="mr-copy" onClick={copy} title={address}>
      <span className="mr-num">{short}</span>
      <span aria-hidden="true" style={{ color: 'var(--mr-text-subtle)' }}>
        {copied ? '✓' : '⧉'}
      </span>
      <VisuallyHidden>{copied ? 'Address copied' : `Copy address ${address}`}</VisuallyHidden>
    </button>
  );
}
