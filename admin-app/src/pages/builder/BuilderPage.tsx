import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, Loader2, Lock, Pencil, Plus, Rocket, Trash2 } from 'lucide-react';
import { newUid, stableStringify, t, validateForPublish, type Question } from '@ff/form-schema';
import { FormFlow, ThankYouScreen, WelcomeScreen } from '@ff/form-renderer';
import { Button, Card, EmptyState, PageLoader, useConfirm, useToast } from '../../components/ui';
import { DevicePreview, DeviceToggle, Segmented, type PreviewDevice } from '../../components/DevicePreview';
import { useAuth } from '../../lib/auth';
import { useDraft, type SaveState } from '../../lib/draft';
import { AddQuestionMenu } from './AddQuestionMenu';
import { PublishDialog } from './PublishDialog';
import { QuestionEditor } from './QuestionEditor';
import { arrayMove, QuestionList, type ItemStatus } from './QuestionList';

function SaveIndicator({ state, onReload }: { state: SaveState; onReload: () => void }) {
  const map = {
    saved: { icon: <CheckCircle2 className="size-4 text-emerald-600" />, text: 'All changes saved' },
    dirty: { icon: <Loader2 className="size-4 text-stone-400" />, text: 'Unsaved changes' },
    saving: { icon: <Loader2 className="size-4 animate-spin text-stone-500" />, text: 'Saving…' },
    error: { icon: <CloudOff className="size-4 text-red-600" />, text: 'Not saved — retrying on next change' },
    conflict: { icon: <AlertCircle className="size-4 text-red-600" />, text: 'Someone else edited this draft' },
  }[state];
  return (
    <span className="flex items-center gap-1.5 text-sm text-stone-600" aria-live="polite">
      {map.icon}
      {map.text}
      {state === 'conflict' && (
        <button type="button" className="font-medium text-stone-900 underline" onClick={onReload}>
          Reload
        </button>
      )}
    </span>
  );
}

type PreviewScreen = 'welcome' | 'form' | 'thanks';

export function BuilderPage() {
  const { canEdit } = useAuth();
  const { state, doc, editing, loading, loadError, saveState, update, startEditing, discard, reload } = useDraft();
  const confirm = useConfirm();
  const toast = useToast();
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [device, setDevice] = useState<PreviewDevice>('tablet');
  const [screen, setScreen] = useState<PreviewScreen>('form');
  const [starting, setStarting] = useState(false);

  const readOnly = !editing || !canEdit;
  const L = doc?.defaultLocale ?? 'en';
  const questions = doc?.questions ?? [];
  const liveDoc = state?.live?.doc ?? null;
  const liveByUid = useMemo(() => new Map((liveDoc?.questions ?? []).map((q) => [q.uid, q])), [liveDoc]);

  // Keep a valid selection.
  useEffect(() => {
    if (!questions.length) setSelectedUid(null);
    else if (!selectedUid || !questions.some((q) => q.uid === selectedUid)) setSelectedUid(questions[0]!.uid);
  }, [questions, selectedUid]);

  const issuesByUid = useMemo(() => {
    if (!doc || !editing) return {};
    const out: Record<string, 'error' | 'warning'> = {};
    for (const i of validateForPublish(doc, state?.knownTypes ?? {})) {
      if (i.questionUid && out[i.questionUid] !== 'error') out[i.questionUid] = i.severity;
    }
    return out;
  }, [doc, editing, state?.knownTypes]);

  if (loading) return <PageLoader />;
  if (loadError || !doc || !state) {
    return (
      <div className="p-8">
        <EmptyState icon={<AlertCircle />} title="Could not load the form">
          {loadError}
        </EmptyState>
      </div>
    );
  }

  const selectedIndex = questions.findIndex((q) => q.uid === selectedUid);
  const selected = questions[selectedIndex];
  const removed = editing ? (liveDoc?.questions ?? []).filter((q) => !questions.some((x) => x.uid === q.uid)) : [];

  const statusOf = (q: Question): ItemStatus => {
    if (!editing) return 'same';
    const live = liveByUid.get(q.uid);
    if (!live) return 'new';
    return stableStringify(live) === stableStringify(q) ? 'same' : 'edited';
  };

  const insertAfterSelected = (q: Question) =>
    update((d) => {
      const at = selectedIndex >= 0 ? selectedIndex + 1 : d.questions.length;
      d.questions.splice(at, 0, q);
    });

  const onAdd = (q: Question) => {
    insertAfterSelected(q);
    setSelectedUid(q.uid);
    setScreen('form');
  };

  const onDelete = async (uid: string) => {
    const q = questions.find((x) => x.uid === uid)!;
    const count = state.answerCounts[uid] ?? 0;
    if (liveByUid.has(uid) || count > 0) {
      const ok = await confirm({
        title: 'Remove this question?',
        body: (
          <>
            <strong>“{t(q.label, L) || 'Untitled'}”</strong> will be removed from the form when you publish.
            {count > 0 && (
              <>
                {' '}
                Its <strong>{count}</strong> existing answers are <strong>not deleted</strong> — they stay in responses and exports.
              </>
            )}{' '}
            You can restore it until then.
          </>
        ),
        confirmText: 'Remove question',
        danger: true,
      });
      if (!ok) return;
    }
    update((d) => {
      d.questions = d.questions.filter((x) => x.uid !== uid);
    });
  };

  const onDuplicate = (uid: string) => {
    const q = questions.find((x) => x.uid === uid)!;
    const copy = structuredClone(q);
    copy.uid = newUid('q');
    if ('options' in copy) copy.options = copy.options.map((o) => ({ ...o, uid: newUid('o') }));
    update((d) => {
      d.questions.splice(d.questions.findIndex((x) => x.uid === uid) + 1, 0, copy);
    });
    setSelectedUid(copy.uid);
  };

  const onRestore = (q: Question) => {
    update((d) => {
      d.questions.push(structuredClone(q));
    });
    setSelectedUid(q.uid);
  };

  const onDiscard = async () => {
    const ok = await confirm({
      title: 'Discard this draft?',
      body: 'All unpublished changes will be lost. The live form and all collected responses are not affected.',
      confirmText: 'Discard draft',
      danger: true,
    });
    if (!ok) return;
    try {
      await discard();
      toast('success', 'Draft discarded');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not discard');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-100/90 px-6 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="font-display text-2xl">Form builder</h1>
          {editing ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              Draft{state.live ? ` · based on v${state.live.number}` : ''}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
              {state.live ? `Live · v${state.live.number}` : 'Not published'}
            </span>
          )}
          {editing && <SaveIndicator state={saveState} onReload={() => void reload()} />}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void onDiscard()}>
                  Discard draft
                </Button>
                <Button variant="primary" icon={<Rocket className="size-4" />} onClick={() => setPublishing(true)} disabled={saveState === 'conflict'}>
                  Review & publish
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                icon={<Pencil className="size-4" />}
                loading={starting}
                onClick={async () => {
                  setStarting(true);
                  await startEditing();
                  setStarting(false);
                }}
              >
                Edit form
              </Button>
            )}
          </div>
        )}
      </div>

      {!editing && (
        <div className="mx-6 mt-4 flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-stone-600 ring-1 ring-stone-200">
          <Lock className="mt-0.5 size-4 shrink-0 text-stone-400" />
          <span>
            You are viewing the live form. {canEdit ? 'Click “Edit form” to open a draft — ' : ''}visitors keep seeing the live version until a draft is published. Reordering, adding or removing
            questions never changes responses already collected.
          </span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-5 p-6 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] xl:grid-cols-[280px_minmax(340px,1fr)_minmax(380px,520px)]">
        {/* Question list */}
        <section aria-label="Questions" className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">
              {questions.length} {questions.length === 1 ? 'item' : 'items'}
            </h2>
            {!readOnly && (
              <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                Add question
              </Button>
            )}
          </div>
          {questions.length === 0 ? (
            <Card>
              <EmptyState icon={<Plus />} title="No questions yet">
                Add your first question to get started.
              </EmptyState>
            </Card>
          ) : (
            <QuestionList
              questions={questions}
              locale={L}
              selectedUid={selectedUid}
              onSelect={(uid) => {
                setSelectedUid(uid);
                setScreen('form');
              }}
              onReorder={(from, to) =>
                update((d) => {
                  d.questions = arrayMove(d.questions, from, to);
                })
              }
              onDuplicate={onDuplicate}
              onDelete={(uid) => void onDelete(uid)}
              statusOf={statusOf}
              answerCounts={state.answerCounts}
              issuesByUid={issuesByUid}
              readOnly={readOnly}
              removed={removed}
              onRestore={onRestore}
            />
          )}
        </section>

        {/* Editor */}
        <section aria-label="Question settings" className="min-w-0">
          <Card className="p-6">
            {selected ? (
              <QuestionEditor
                key={selected.uid}
                q={selected}
                index={selectedIndex}
                locale={L}
                readOnly={readOnly}
                publishedType={state.knownTypes[selected.uid]}
                answerCount={state.answerCounts[selected.uid] ?? 0}
                onChange={(q) =>
                  update((d) => {
                    d.questions[d.questions.findIndex((x) => x.uid === selected.uid)] = q;
                  })
                }
                onReplace={(q) => {
                  update((d) => {
                    d.questions[d.questions.findIndex((x) => x.uid === selected.uid)] = q;
                  });
                  setSelectedUid(q.uid);
                }}
              />
            ) : (
              <EmptyState icon={<Pencil />} title="Select a question">
                Pick a question on the left to edit it.
              </EmptyState>
            )}
          </Card>
        </section>

        {/* Live preview */}
        <section aria-label="Preview" className="min-w-0 lg:col-span-2 xl:col-span-1">
          <div className="sticky top-20">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Segmented<PreviewScreen>
                value={screen}
                onChange={setScreen}
                options={[
                  { value: 'welcome', label: 'Welcome' },
                  { value: 'form', label: 'Questions' },
                  { value: 'thanks', label: 'Thank you' },
                ]}
              />
              <DeviceToggle value={device} onChange={setDevice} />
            </div>
            <DevicePreview device={device}>
              {screen === 'welcome' && <WelcomeScreen doc={doc} locale={L} logoSrc={doc.theme.logoUrl} onStart={() => setScreen('form')} />}
              {screen === 'form' && (
                <FormFlow
                  doc={doc}
                  locale={L}
                  step={Math.max(selectedIndex, 0)}
                  onStepChange={(s) => questions[s] && setSelectedUid(questions[s]!.uid)}
                  onExit={() => setScreen('welcome')}
                  onSubmit={() => setScreen('thanks')}
                />
              )}
              {screen === 'thanks' && <ThankYouScreen doc={doc} locale={L} logoSrc={doc.theme.logoUrl} onDone={() => setScreen('welcome')} />}
            </DevicePreview>
            <p className="mt-2 text-center text-xs text-stone-500">Preview — answers here are not saved.</p>
          </div>
        </section>
      </div>

      <AddQuestionMenu open={adding} onClose={() => setAdding(false)} onAdd={onAdd} locale={L} />
      <PublishDialog
        open={publishing}
        onClose={() => setPublishing(false)}
        onFocusQuestion={(uid) => {
          setSelectedUid(uid);
          setScreen('form');
        }}
      />
    </div>
  );
}
