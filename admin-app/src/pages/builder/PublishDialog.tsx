import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { t } from '@ff/form-schema';
import { Button, Modal, Spinner, useToast } from '../../components/ui';
import { api, ApiError, type DraftCheck } from '../../lib/api';
import { useDraft } from '../../lib/draft';

export function PublishDialog({ open, onClose, onFocusQuestion }: { open: boolean; onClose: () => void; onFocusQuestion: (uid: string) => void }) {
  const { flush, state, doc, reload } = useDraft();
  const toast = useToast();
  const [check, setCheck] = useState<DraftCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCheck(null);
    setError(null);
    void (async () => {
      if (!(await flush())) {
        setError('Your latest changes could not be saved. Fix the save problem first.');
        return;
      }
      try {
        setCheck(await api<DraftCheck>('/api/admin/form/draft/check'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not check the draft');
      }
    })();
  }, [open, flush]);

  const L = doc?.defaultLocale ?? 'en';
  const labelOf = (uid: string) => {
    const q = doc?.questions.find((x) => x.uid === uid) ?? state?.live?.doc.questions.find((x) => x.uid === uid);
    return q ? t(q.label, L) || 'Untitled' : uid;
  };
  const errors = check?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = check?.issues.filter((i) => i.severity === 'warning') ?? [];
  const totalAnswers = Object.values(state?.answerCounts ?? {}).reduce((a, b) => a + b, 0);
  const nextNumber = (state?.live?.number ?? 0) + 1;

  const publish = async () => {
    if (!check) return;
    setPublishing(true);
    try {
      const r = await api<{ number: number }>('/api/admin/form/publish', { method: 'POST', json: { revision: check.revision } });
      toast('success', `Version ${r.number} is live. Kiosks will switch between visitors.`);
      onClose();
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.details && typeof e.details === 'object' && 'issues' in e.details) {
        setCheck({ ...check, issues: (e.details as DraftCheck).issues });
      } else setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const d = check?.diff;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Publish version ${nextNumber}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={publishing} disabled={!check || errors.length > 0 || !d?.hasChanges} onClick={() => void publish()}>
            Publish v{nextNumber}
          </Button>
        </>
      }
    >
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {!check && !error && (
        <div className="grid h-32 place-items-center">
          <Spinner />
        </div>
      )}
      {check && d && (
        <div className="space-y-5 text-sm">
          {!d.hasChanges ? (
            <p className="text-stone-600">This draft is identical to the live version — nothing to publish.</p>
          ) : (
            <section>
              <h3 className="mb-2 font-medium text-stone-900">What changes</h3>
              <ul className="space-y-1.5 text-stone-700">
                {d.added.length > 0 && (
                  <li>
                    <span className="font-medium text-sky-800">+{d.added.length} added:</span> {d.added.map(labelOf).join(', ')}
                  </li>
                )}
                {d.removed.length > 0 && (
                  <li>
                    <span className="font-medium text-red-800">−{d.removed.length} removed:</span>{' '}
                    {d.removed
                      .map((uid) => {
                        const n = state?.answerCounts[uid] ?? 0;
                        return `${labelOf(uid)}${n ? ` (${n} ${n === 1 ? 'answer' : 'answers'} kept)` : ''}`;
                      })
                      .join(', ')}
                  </li>
                )}
                {d.modified.length > 0 && (
                  <li>
                    <span className="font-medium text-amber-800">{d.modified.length} edited:</span> {d.modified.map(labelOf).join(', ')}
                  </li>
                )}
                {d.reordered && <li className="text-stone-700">Question order changed</li>}
                {(d.themeChanged || d.settingsChanged) && <li className="text-stone-700">Branding / kiosk settings changed</li>}
              </ul>
            </section>
          )}

          {errors.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 font-medium text-red-800">
                <XCircle className="size-4" /> Fix before publishing
              </h3>
              <ul className="space-y-1">
                {errors.map((i, n) => (
                  <li key={n}>
                    <button
                      type="button"
                      disabled={!i.questionUid}
                      onClick={() => {
                        if (i.questionUid) onFocusQuestion(i.questionUid);
                        onClose();
                      }}
                      className="text-left text-red-800 underline-offset-2 enabled:hover:underline"
                    >
                      {i.message}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 font-medium text-amber-800">
                <AlertTriangle className="size-4" /> Worth checking
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-amber-900">
                {warnings.map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </section>
          )}

          {errors.length === 0 && d.hasChanges && (
            <div className="space-y-2 rounded-xl bg-stone-50 p-4 text-stone-700 ring-1 ring-stone-200">
              <p className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>
                  All <strong>{totalAnswers.toLocaleString()}</strong> answers already collected stay exactly as they were, linked to the version they were given on.
                </span>
              </p>
              <p className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0 text-stone-500" />
                <span>Kiosks switch to v{nextNumber} only while idle on the welcome screen. Visitors already filling the form finish on the current version.</span>
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
