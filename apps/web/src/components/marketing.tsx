import Link from 'next/link';
import { COMMERCIAL_DISCLAIMERS } from '@mants/shared-types';

export function CommercialNotice({ variant = 'both' }: { variant?: 'chatgpt' | 'affiliated' | 'both' }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      {variant !== 'affiliated' && <p className="mb-2">{COMMERCIAL_DISCLAIMERS.chatgptNotIncluded}</p>}
      {variant !== 'chatgpt' && <p>{COMMERCIAL_DISCLAIMERS.notAffiliated}</p>}
    </div>
  );
}

export function CtaButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-md bg-brand px-5 py-2.5 font-semibold text-slate-900 transition hover:opacity-90"
    >
      {children}
    </Link>
  );
}
