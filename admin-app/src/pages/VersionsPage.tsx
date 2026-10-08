import { useCallback, useEffect, useState } from 'react';
import { Eye, History, RotateCcw, ShieldCheck } from 'lucide-react';
import type { FormDoc } from '@ff/form-schema';
import { FormFlow, WelcomeScreen } from '@ff/form-renderer';
import { Badge, Button, Card, EmptyState, formatDateTime, Modal, PageHeader, PageLoader, useConfirm, useToast } from '../components/ui';
import { DevicePreview } from '../components/DevicePreview';
import { api, assetUrl, type VersionItem } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useDraft } from '../lib/draft';

export function VersionsPage() {
  const { canEdit } = useAuth();
  const { reload: reloadDraft } = useDraft();
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<VersionItem[] | null>(null);
  const [preview, setPreview] = useState<{ number: number; doc: FormDoc } | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: VersionItem[] }>('/api/admin/form/versions')).items);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load versions');
      setItems([]);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPreview = async (v: VersionItem) => {
    try {
      const r = await api<{ number: number; doc: FormDoc }>(`/api/admin/form/versions/${v.id}`);
      setShowWelcome(true);
      setPreview({ number: r.number, doc: r.doc });
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load version');
    }
  };

  const rollback = async (v: VersionItem) => {
    const ok = await confirm({
      title: `Make version ${v.number} live again?`,
      body: (
        <>
          Kiosks will switch back to v{v.number} between visitors. Nothing is deleted: responses collected on other versions stay as they are, and any open draft is kept.
        </>
      ),
      confirmText: `Roll back to v${v.number}`,
    });
    if (!ok) return;
    try {
      await api('/api/admin/form/rollback', { method: 'POST', json: { versionId: v.id } });
      toast('success', `Version ${v.number} is live`);
      await Promise.all([load(), reloadDraft()]);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Rollback failed');
    }
  };

  if (!items) return <PageLoader />;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeader title="Versions" description="Every publish creates a new, read-only version. Each response stays linked to the exact version the visitor saw." />
      <p className="mb-5 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Published versions can never be edited or deleted, so reordering, removing or adding questions has no effect on feedback already collected.
      </p>
      <Card>
        {items.length === 0 ? (
          <EmptyState icon={<History />} title="Nothing published yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-xs tracking-wide text-stone-500 uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Version</th>
                  <th className="px-5 py-3 font-medium">Published</th>
                  <th className="px-5 py-3 text-right font-medium">Questions</th>
                  <th className="px-5 py-3 text-right font-medium">Responses</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((v) => (
                  <tr key={v.id} className="hover:bg-stone-50">
                    <td className="px-5 py-3">
                      <span className="mr-2 font-semibold">v{v.number}</span>
                      {v.status === 'PUBLISHED' ? <Badge tone="green">Live</Badge> : <Badge>Archived</Badge>}
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {formatDateTime(v.publishedAt)}
                      {v.publishedBy && <span className="block text-xs text-stone-400">by {v.publishedBy}</span>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{v.questionCount}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{v.submissions.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" icon={<Eye className="size-4" />} onClick={() => void openPreview(v)}>
                          View
                        </Button>
                        {canEdit && v.status !== 'PUBLISHED' && (
                          <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => void rollback(v)}>
                            Roll back
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Version ${preview?.number} (read-only)`} size="lg">
        {preview && (
          <DevicePreview device="tablet">
            {showWelcome ? (
              <WelcomeScreen doc={preview.doc} locale={preview.doc.defaultLocale} logoSrc={assetUrl(preview.doc.theme.logoUrl)} onStart={() => setShowWelcome(false)} />
            ) : (
              <FormFlow doc={preview.doc} locale={preview.doc.defaultLocale} onExit={() => setShowWelcome(true)} onSubmit={() => setShowWelcome(true)} />
            )}
          </DevicePreview>
        )}
      </Modal>
    </div>
  );
}
