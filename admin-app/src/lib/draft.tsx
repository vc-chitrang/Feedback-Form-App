import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { FormDoc } from '@ff/form-schema';
import { useToast } from '../components/ui';
import { api, ApiError, type FormState } from './api';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

interface DraftStore {
  state: FormState | null;
  loading: boolean;
  loadError: string | null;
  /** Doc being shown: the draft when editing, otherwise the live version (read-only). */
  doc: FormDoc | null;
  editing: boolean;
  revision: number | null;
  saveState: SaveState;
  reload: () => Promise<void>;
  startEditing: () => Promise<void>;
  update: (mutate: (doc: FormDoc) => void) => void;
  /** Wait until every pending change is saved. Resolves false if saving failed. */
  flush: () => Promise<boolean>;
  discard: () => Promise<void>;
}

const Ctx = createContext<DraftStore | null>(null);

/**
 * Holds the draft and autosaves it (debounced) with optimistic locking.
 * Saves are serialised through a promise chain so revisions never race each other.
 */
export function DraftProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [state, setState] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [doc, setDoc] = useState<FormDoc | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const docRef = useRef<FormDoc | null>(null);
  const revRef = useRef<number | null>(null);
  const dirty = useRef(false);
  const conflict = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));

  const apply = useCallback((s: FormState) => {
    setState(s);
    const d = s.draft?.doc ?? s.live?.doc ?? null;
    docRef.current = d;
    revRef.current = s.draft?.revision ?? null;
    dirty.current = false;
    conflict.current = false;
    setDoc(d);
    setRevision(revRef.current);
    setSaveState('saved');
  }, []);

  const reload = useCallback(async () => {
    try {
      apply(await api<FormState>('/api/admin/form'));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load the form');
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    chain.current = chain.current.then(async () => {
      if (conflict.current) return false;
      if (!dirty.current || revRef.current === null) return true;
      dirty.current = false;
      setSaveState('saving');
      try {
        const r = await api<{ revision: number }>('/api/admin/form/draft', {
          method: 'PUT',
          json: { revision: revRef.current, doc: docRef.current },
        });
        revRef.current = r.revision;
        setRevision(r.revision);
        setSaveState(dirty.current ? 'dirty' : 'saved');
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          conflict.current = true;
          setSaveState('conflict');
        } else {
          dirty.current = true;
          setSaveState('error');
          toast('error', e instanceof Error ? `Could not save: ${e.message}` : 'Could not save');
        }
        return false;
      }
    });
    return chain.current;
  }, [toast]);

  const update = useCallback(
    (mutate: (doc: FormDoc) => void) => {
      if (!docRef.current || revRef.current === null || conflict.current) return;
      const next = structuredClone(docRef.current);
      mutate(next);
      docRef.current = next;
      setDoc(next);
      dirty.current = true;
      setSaveState('dirty');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush],
  );

  const startEditing = useCallback(async () => {
    try {
      await api('/api/admin/form/draft', { method: 'POST' });
      await reload();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not start editing');
    }
  }, [reload, toast]);

  const discard = useCallback(async () => {
    clearTimeout(timer.current);
    dirty.current = false;
    await api('/api/admin/form/draft', { method: 'DELETE' });
    await reload();
  }, [reload]);

  return (
    <Ctx.Provider
      value={{
        state,
        loading,
        loadError,
        doc,
        editing: !!state?.draft,
        revision,
        saveState,
        reload,
        startEditing,
        update,
        flush,
        discard,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDraft(): DraftStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDraft outside DraftProvider');
  return ctx;
}
