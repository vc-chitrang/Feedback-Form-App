import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Info, Plus, Trash2 } from 'lucide-react';
import { getCountries } from 'libphonenumber-js';
import {
  createOption,
  createQuestion,
  isChoiceQuestion,
  QUESTION_TYPE_META,
  QUESTION_TYPES,
  setText,
  t,
  type ChoiceOption,
  type I18nText,
  type Question,
  type QuestionType,
} from '@ff/form-schema';
import { Button, Field, IconButton, Select, TextArea, TextInput, Toggle, useConfirm } from '../../components/ui';
import { QUESTION_ICONS } from '../../lib/questionIcons';

interface Props {
  q: Question;
  index: number;
  locale: string;
  readOnly: boolean;
  /** Type this uid had in a published version (undefined = never published). */
  publishedType?: QuestionType;
  answerCount: number;
  onChange: (q: Question) => void;
  /** Replace with a brand-new question (new uid) — used for type changes of published questions. */
  onReplace: (q: Question) => void;
}

/** Number box that only commits valid numbers; empty → undefined when allowed. */
function NumberField({
  label,
  value,
  onChange,
  allowEmpty,
  disabled,
  min,
  integer,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  allowEmpty?: boolean;
  disabled?: boolean;
  min?: number;
  integer?: boolean;
}) {
  const [text, setTextState] = useState(value === undefined ? '' : String(value));
  useEffect(() => setTextState(value === undefined ? '' : String(value)), [value]);
  const commit = (s: string) => {
    if (s.trim() === '') {
      if (allowEmpty) onChange(undefined);
      return;
    }
    const n = Number(s);
    if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || (min !== undefined && n < min)) return;
    onChange(n);
  };
  return (
    <Field label={label}>
      <TextInput
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={allowEmpty ? 'No limit' : undefined}
        onChange={(e) => {
          setTextState(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setTextState(value === undefined ? '' : String(value))}
      />
    </Field>
  );
}

function OptionsEditor({
  q,
  locale,
  readOnly,
  onChange,
}: {
  q: Extract<Question, { options: ChoiceOption[] }>;
  locale: string;
  readOnly: boolean;
  onChange: (options: ChoiceOption[]) => void;
}) {
  const opts = q.options;
  const set = (i: number, patch: Partial<ChoiceOption>) => onChange(opts.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, to: number) => {
    const next = [...opts];
    const [x] = next.splice(i, 1);
    next.splice(to, 0, x!);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-stone-700">Options</p>
      <ul className="space-y-2">
        {opts.map((o, i) => (
          <li key={o.uid} className="rounded-lg bg-stone-50 p-2 ring-1 ring-stone-200">
            <div className="flex items-center gap-1">
              <span className="w-6 text-center text-xs text-stone-400 tabular-nums">{i + 1}</span>
              <TextInput
                aria-label={`Option ${i + 1}`}
                value={t(o.label, locale)}
                disabled={readOnly}
                maxLength={200}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => set(i, { label: setText(o.label, locale, e.target.value) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && i === opts.length - 1 && !readOnly) onChange([...opts, createOption(locale, '')]);
                }}
              />
              {!readOnly && (
                <>
                  <IconButton label="Move option up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton label="Move option down" disabled={i === opts.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton label="Remove option" onClick={() => onChange(opts.filter((_, j) => j !== i))} className="hover:text-red-700">
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </>
              )}
            </div>
            {!readOnly && (
              <div className="mt-1.5 ml-7 flex flex-wrap gap-4 text-xs text-stone-600">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!o.isOther}
                    onChange={(e) => set(i, { isOther: e.target.checked || undefined })}
                    className="accent-stone-900"
                  />
                  Asks to specify (“Other”)
                </label>
                {q.type === 'multi_choice' && (
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={!!o.exclusive}
                      onChange={(e) => set(i, { exclusive: e.target.checked || undefined })}
                      className="accent-stone-900"
                    />
                    Exclusive (“None of these”)
                  </label>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!readOnly && (
        <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => onChange([...opts, createOption(locale, '')])} disabled={opts.length >= 50}>
          Add option
        </Button>
      )}
    </div>
  );
}

const COUNTRIES = getCountries();

export function QuestionEditor({ q, index, locale, readOnly, publishedType, answerCount, onChange, onReplace }: Props) {
  const confirm = useConfirm();
  const patch = (p: Partial<Question>) => onChange({ ...q, ...p } as Question);
  const text = (field: I18nText | undefined) => t(field, locale);
  const setI18n = (key: string, value: string) => patch({ [key]: setText((q as Record<string, unknown>)[key] as I18nText | undefined, locale, value) } as Partial<Question>);
  const Icon = QUESTION_ICONS[q.type];

  const changeType = async (type: QuestionType) => {
    if (type === q.type) return;
    const next = createQuestion(type, locale) as Question;
    const carried = { ...next, label: q.label, help: q.help, required: type === 'section' ? false : q.required } as Question;
    if (isChoiceQuestion(q) && isChoiceQuestion(carried)) carried.options = q.options;
    if (publishedType) {
      const ok = await confirm({
        title: 'Change question type?',
        body: (
          <>
            This question is already live{answerCount > 0 ? ` and has ${answerCount} answers` : ''}. Changing its type creates a <strong>new question</strong>, so old answers stay attached to the
            original one and reports stay correct.
          </>
        ),
        confirmText: 'Create new question',
      });
      if (!ok) return;
      onReplace(carried); // new uid from createQuestion
    } else {
      onChange({ ...carried, uid: q.uid } as Question);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-stone-900 text-white">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">Question {index + 1}</p>
          <p className="truncate text-sm text-stone-600">{QUESTION_TYPE_META[q.type].description}</p>
        </div>
      </div>

      <Field label="Type">
        <Select value={q.type} disabled={readOnly} onChange={(e) => void changeType(e.target.value as QuestionType)}>
          {QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {QUESTION_TYPE_META[type].label} — {QUESTION_TYPE_META[type].description}
            </option>
          ))}
        </Select>
      </Field>

      {answerCount > 0 && (
        <p className="flex gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-200">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {answerCount} visitors answered this question. Edits only apply to the next published version — existing answers keep the exact wording they were given with.
        </p>
      )}

      <Field label={q.type === 'section' ? 'Heading' : q.type === 'consent' ? 'Consent statement' : 'Question'}>
        <TextArea
          rows={2}
          value={text(q.label)}
          disabled={readOnly}
          maxLength={500}
          placeholder={q.type === 'consent' ? 'I agree that…' : 'Type your question'}
          onChange={(e) => setI18n('label', e.target.value)}
          autoFocus={!text(q.label)}
        />
      </Field>
      <Field label="Help text (optional)" hint="Shown under the question in smaller text.">
        <TextInput value={text(q.help)} disabled={readOnly} maxLength={300} onChange={(e) => setI18n('help', e.target.value)} />
      </Field>
      {q.type !== 'section' && <Toggle label="Required" checked={q.required} disabled={readOnly} onChange={(v) => patch({ required: v })} />}

      {isChoiceQuestion(q) && <OptionsEditor q={q} locale={locale} readOnly={readOnly} onChange={(options) => patch({ options } as Partial<Question>)} />}

      {q.type === 'single_choice' && (
        <Field label="Layout">
          <Select value={q.layout ?? 'list'} disabled={readOnly} onChange={(e) => patch({ layout: e.target.value as 'list' | 'chips' })}>
            <option value="list">List (large cards)</option>
            <option value="chips">Chips (compact, good for short options)</option>
          </Select>
        </Field>
      )}

      {q.type === 'multi_choice' && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Min selections" value={q.minSelect} allowEmpty integer min={0} disabled={readOnly} onChange={(v) => patch({ minSelect: v })} />
          <NumberField label="Max selections" value={q.maxSelect} allowEmpty integer min={1} disabled={readOnly} onChange={(v) => patch({ maxSelect: v })} />
        </div>
      )}

      {q.type === 'dropdown' && (
        <Field label="Placeholder" hint="Visitors can search the list. To let them type a value that is not listed, add an option and tick “Asks to specify (Other)”.">

          <TextInput value={text(q.placeholder)} disabled={readOnly} placeholder="Select…" onChange={(e) => setI18n('placeholder', e.target.value)} />
        </Field>
      )}

      {q.type === 'short_text' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Format">
            <Select value={q.format ?? 'any'} disabled={readOnly} onChange={(e) => patch({ format: e.target.value as 'any' | 'name' })}>
              <option value="any">Any text</option>
              <option value="name">Person’s name (letters only)</option>
            </Select>
          </Field>
          <NumberField label="Max characters" value={q.maxLength} integer min={1} disabled={readOnly} onChange={(v) => patch({ maxLength: v === undefined ? undefined : Math.min(v, 500) })} />
        </div>
      )}
      {(q.type === 'short_text' || q.type === 'long_text' || q.type === 'email') && (
        <Field label="Placeholder">
          <TextInput value={text(q.placeholder)} disabled={readOnly} onChange={(e) => setI18n('placeholder', e.target.value)} />
        </Field>
      )}
      {q.type === 'long_text' && (
        <NumberField label="Max characters" value={q.maxLength} integer min={1} disabled={readOnly} onChange={(v) => patch({ maxLength: v === undefined ? undefined : Math.min(v, 5000) })} />
      )}

      {q.type === 'phone' && (
        <Field label="Default country">
          <Select value={q.defaultCountry ?? 'IN'} disabled={readOnly} onChange={(e) => patch({ defaultCountry: e.target.value })}>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {q.type === 'number' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Minimum" value={q.min} allowEmpty disabled={readOnly} onChange={(v) => patch({ min: v })} />
            <NumberField label="Maximum" value={q.max} allowEmpty disabled={readOnly} onChange={(v) => patch({ max: v })} />
          </div>
          <Toggle label="Whole numbers only" checked={!!q.integer} disabled={readOnly} onChange={(v) => patch({ integer: v })} />
          <Field label="Unit (optional)">
            <TextInput value={text(q.unit)} disabled={readOnly} placeholder="e.g. people" onChange={(e) => setI18n('unit', e.target.value)} />
          </Field>
        </>
      )}

      {q.type === 'slider' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Minimum" value={q.min} disabled={readOnly} onChange={(v) => v !== undefined && patch({ min: v })} />
            <NumberField label="Maximum" value={q.max} disabled={readOnly} onChange={(v) => v !== undefined && patch({ max: v })} />
            <NumberField label="Step" value={q.step} disabled={readOnly} onChange={(v) => v !== undefined && patch({ step: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Left label">
              <TextInput value={text(q.minLabel)} disabled={readOnly} placeholder={String(q.min)} onChange={(e) => setI18n('minLabel', e.target.value)} />
            </Field>
            <Field label="Right label">
              <TextInput value={text(q.maxLabel)} disabled={readOnly} placeholder={String(q.max)} onChange={(e) => setI18n('maxLabel', e.target.value)} />
            </Field>
          </div>
          <Field label="Unit (optional)">
            <TextInput value={text(q.unit)} disabled={readOnly} placeholder="e.g. years" onChange={(e) => setI18n('unit', e.target.value)} />
          </Field>
          <p className="text-xs text-stone-500">The slider starts empty, so visitors who skip it don’t submit a default value. For age, a single-choice “Age group” question is quicker on a touch screen.</p>
        </>
      )}

      {q.type === 'rating' && (
        <Field label="Number of stars">
          <Select value={q.max} disabled={readOnly} onChange={(e) => patch({ max: Number(e.target.value) })}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {q.type === 'nps' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Label for 0">
            <TextInput value={text(q.lowLabel)} disabled={readOnly} onChange={(e) => setI18n('lowLabel', e.target.value)} />
          </Field>
          <Field label="Label for 10">
            <TextInput value={text(q.highLabel)} disabled={readOnly} onChange={(e) => setI18n('highLabel', e.target.value)} />
          </Field>
        </div>
      )}

      {q.type === 'date' && (
        <div className="space-y-3">
          <Toggle label="Block future dates" checked={!!q.disallowFuture} disabled={readOnly} onChange={(v) => patch({ disallowFuture: v })} />
          <Toggle label="Block past dates" checked={!!q.disallowPast} disabled={readOnly} onChange={(v) => patch({ disallowPast: v })} />
        </div>
      )}

      {q.type === 'consent' && (
        <p className="text-xs leading-relaxed text-stone-500">
          Visitors see this statement with an “I agree” tick box. Keep it optional unless agreeing is truly needed — under India’s DPDP Act consent must be freely given.
        </p>
      )}
    </div>
  );
}
