import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Download, Inbox, Lock, MessageSquareText, Smartphone, Tablet } from 'lucide-react';
import { EMOJI_SCALE } from '@ff/form-schema';
import { cx } from '@ff/form-renderer';
import { Badge, Button, Card, EmptyState, Field, formatDateTime, PageHeader, PageLoader, Select, TextInput, useToast } from '../components/ui';
import { api, apiUrl, sessionStore, type ResponseItem, type Summary, type VersionItem } from '../lib/api';

interface Filters {
  versionId: string;
  from: string;
  to: string;
}

const toQuery = (f: Filters, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams();
  if (f.versionId) p.set('versionId', f.versionId);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

function Bar({ label, count, total, accent }: { label: string; count: number; total: number; accent?: boolean }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span className="truncate text-stone-700">{label}</span>
      <span className="text-stone-500 tabular-nums">
        {count} · {pct}%
      </span>
      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={cx('h-full rounded-full', accent ? 'bg-amber-400' : 'bg-[#7a1f2b]')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function QuestionSummary({ q }: { q: Summary['questions'][number] }) {
  const s = q.stats;
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="font-medium text-stone-900">{q.label || 'Untitled'}</h3>
        <div className="flex shrink-0 gap-1">
          {!q.inLive && <Badge tone="amber">Removed</Badge>}
          <Badge>
            {q.answered} {q.answered === 1 ? 'answer' : 'answers'}
          </Badge>
        </div>
      </div>
      {s.kind === 'choice' && (
        <div className="space-y-3">
          {s.counts.map((c) => (
            <Bar key={c.optionUid} label={c.label} count={c.count} total={q.answered} />
          ))}
          {s.otherTexts.length > 0 && <p className="text-xs text-stone-500">“Other”: {s.otherTexts.join(' · ')}</p>}
        </div>
      )}
      {s.kind === 'numeric' && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-4">
            {s.average !== null && (
              <p>
                <span className="font-display text-3xl">{s.average}</span>
                <span className="ml-1 text-sm text-stone-500">average</span>
              </p>
            )}
            {s.npsScore !== undefined && s.npsScore !== null && (
              <p>
                <span className="font-display text-3xl">{s.npsScore > 0 ? `+${s.npsScore}` : s.npsScore}</span>
                <span className="ml-1 text-sm text-stone-500">NPS</span>
              </p>
            )}
          </div>
          {s.distribution.length > 0 && s.distribution.length <= 11 && (
            <div className="space-y-2">
              {[...s.distribution].reverse().map((d) => (
                <Bar
                  key={d.value}
                  label={q.type === 'emoji' ? `${EMOJI_SCALE[d.value - 1]?.emoji ?? ''} ${EMOJI_SCALE[d.value - 1]?.label ?? d.value}` : q.type === 'rating' ? `${'★'.repeat(d.value)}` : String(d.value)}
                  count={d.count}
                  total={q.answered}
                  accent={q.type === 'rating'}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {s.kind === 'boolean' && (
        <div className="space-y-3">
          <Bar label="Yes" count={s.yes} total={q.answered} />
          <Bar label="No" count={s.no} total={q.answered} />
        </div>
      )}
      {s.kind === 'text' && (
        <ul className="space-y-2">
          {s.latest.length === 0 && <li className="text-sm text-stone-400">No answers yet</li>}
          {s.latest.map((txt, i) => (
            <li key={i} className="flex gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
              <MessageSquareText className="mt-0.5 size-4 shrink-0 text-stone-400" />
              <span className="line-clamp-3 whitespace-pre-line">{txt}</span>
            </li>
          ))}
        </ul>
      )}
      {s.kind === 'private' && (
        <p className="flex items-center gap-2 text-sm text-stone-500">
          <Lock className="size-4" /> Personal data — see individual responses or export.
        </p>
      )}
    </Card>
  );
}

function ResponseRow({ r }: { r: ResponseItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-stone-100 last:border-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5 text-left text-sm hover:bg-stone-50">
        {r.channel === 'kiosk' ? <Tablet className="size-4 shrink-0 text-stone-400" /> : <Smartphone className="size-4 shrink-0 text-stone-400" />}
        <span className="min-w-0 shrink-0 text-stone-700 sm:w-44">{formatDateTime(r.receivedAt)}</span>
        <Badge>v{r.versionNumber}</Badge>
        <span className="hidden min-w-0 flex-1 truncate text-stone-500 sm:block">{r.deviceName ?? 'QR / link'}</span>
        <span className="ml-auto shrink-0 text-stone-400 tabular-nums sm:ml-0">
          {r.answers.length}
          <span className="hidden sm:inline"> answers</span>
        </span>
        <ChevronDown className={cx('size-4 shrink-0 text-stone-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <dl className="grid gap-x-6 gap-y-3 bg-stone-50 px-5 py-4 text-sm sm:grid-cols-2">
          {r.answers.map((a) => (
            <div key={a.questionUid}>
              <dt className="text-xs text-stone-500">{a.label}</dt>
              <dd className="whitespace-pre-line text-stone-900">{a.display}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export function ResponsesPage() {
  const toast = useToast();
  const [filters, setFilters] = useState<Filters>({ versionId: '', from: '', to: '' });
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    api<{ items: VersionItem[] }>('/api/admin/form/versions')
      .then((r) => setVersions(r.items))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setSummary(null);
    try {
      const [s, list] = await Promise.all([
        api<Summary>(`/api/admin/responses/summary${toQuery(filters)}`),
        api<{ items: ResponseItem[]; nextCursor: string | null }>(`/api/admin/responses${toQuery(filters, { limit: '25' })}`),
      ]);
      setSummary(s);
      setItems(list.items);
      setCursor(list.nextCursor);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load responses');
    }
  }, [filters, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Download via fetch (not a plain link) so the bearer token is sent when the API is on another domain.
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const token = sessionStore.get();
      const res = await fetch(apiUrl(`/api/admin/responses/export.csv${toQuery(filters)}`), {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'feedback.csv';
      const href = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href, download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const list = await api<{ items: ResponseItem[]; nextCursor: string | null }>(`/api/admin/responses${toQuery(filters, { limit: '25', cursor })}`);
      setItems((x) => [...x, ...list.items]);
      setCursor(list.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageHeader
        title="Responses"
        description="Results combine every version by question, so removed questions keep their history."
        actions={
          <Button variant="primary" icon={<Download className="size-4" />} loading={exporting} onClick={() => void exportCsv()}>
            Export CSV
          </Button>
        }
      />

      <Card className="mb-6 grid gap-4 p-4 sm:grid-cols-3">
        <Field label="Version">
          <Select value={filters.versionId} onChange={(e) => setFilters({ ...filters, versionId: e.target.value })}>
            <option value="">All versions</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.number}
                {v.status === 'PUBLISHED' ? ' (live)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <TextInput type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        </Field>
        <Field label="To">
          <TextInput type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </Field>
      </Card>

      {!summary ? (
        <PageLoader />
      ) : summary.totalResponses === 0 ? (
        <Card>
          <EmptyState icon={<Inbox />} title="No responses yet">
            Pair a kiosk or share the QR link from <strong>Devices & QR</strong> to start collecting feedback.
          </EmptyState>
        </Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-stone-600">
            <span className="font-display text-4xl text-stone-900">{summary.totalResponses.toLocaleString()}</span>{' '}
            {summary.totalResponses === 1 ? 'response' : 'responses'}
          </p>
          {/* Masonry: cards keep their natural height instead of stretching to the tallest in the row. */}
          <div className="mb-8 columns-1 gap-4 md:columns-2 2xl:columns-3">
            {summary.questions.map((q) => (
              <div key={q.uid} className="mb-4 break-inside-avoid">
                <QuestionSummary q={q} />
              </div>
            ))}
          </div>
          <h2 className="mb-3 font-semibold">Individual responses</h2>
          <Card>
            <ul>
              {items.map((r) => (
                <ResponseRow key={r.id} r={r} />
              ))}
            </ul>
            {cursor && (
              <div className="border-t border-stone-100 p-3 text-center">
                <Button size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                  Load more
                </Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
