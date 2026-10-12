import type { SourceMeta } from '@/lib/types';
import { formatNpt } from '@/lib/format';

export function Card({ title, right, children, id }: { title: string; right?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Tag({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' | 'sky' | 'emerald' | 'red' | 'violet' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-800 ring-slate-300', amber: 'bg-amber-100 text-amber-900 ring-amber-300', sky: 'bg-sky-100 text-sky-900 ring-sky-300',
    emerald: 'bg-emerald-100 text-emerald-900 ring-emerald-300', red: 'bg-red-100 text-red-900 ring-red-300', violet: 'bg-violet-100 text-violet-900 ring-violet-300',
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${t}`}>{children}</span>;
}

export function SourceLine({ s }: { s: SourceMeta | undefined }) {
  if (!s) return null;
  return (
    <li>
      <a className="text-emerald-800 underline" href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a>
      {' · '}
      {s.status === 'ok' ? `retrieved ${formatNpt(s.fetchedAt)}` : s.status === 'skipped' ? 'not requested' : `unavailable (${s.message ?? 'unknown error'})`}
    </li>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
      {message}
      {onRetry && (
        <button className="ml-2 underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
