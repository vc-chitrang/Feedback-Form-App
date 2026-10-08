import { createOption, createQuestion, QUESTION_TYPE_META, QUESTION_TYPES, type Question, type QuestionType } from '@ff/form-schema';
import { Sparkles } from 'lucide-react';
import { Modal } from '../../components/ui';
import { QUESTION_ICONS } from '../../lib/questionIcons';

const CATEGORIES = ['Choice', 'Scale', 'Text', 'Contact', 'Other'] as const;

/** Ready-made questions that are common in visitor feedback. */
function templates(locale: string): Array<{ name: string; build: () => Question }> {
  const L = (s: string) => ({ [locale]: s });
  return [
    {
      name: 'Overall visit rating',
      build: () => ({ ...createQuestion('rating', locale), label: L('How would you rate your overall visit?'), required: true }),
    },
    {
      name: 'Age group',
      build: () => ({
        ...createQuestion('single_choice', locale),
        label: L('Your age group'),
        layout: 'chips' as const,
        options: ['Under 12', '12–17', '18–24', '25–34', '35–49', '50–64', '65+'].map((s) => createOption(locale, s)),
      }),
    },
    {
      name: 'How did you hear about us?',
      build: () => ({
        ...createQuestion('single_choice', locale),
        label: L('How did you hear about us?'),
        options: [
          ...['Friends or family', 'Social media', 'Newspaper / TV', 'Travel website', 'School or college'].map((s) => createOption(locale, s)),
          { ...createOption(locale, 'Other'), isOther: true },
        ],
      }),
    },
    {
      name: 'Visitor name',
      build: () => ({ ...createQuestion('short_text', locale), label: L('Your name'), format: 'name' as const }),
    },
    {
      name: 'Contact consent',
      build: () => ({ ...createQuestion('consent', locale), label: L('I agree to be contacted about events and exhibitions.') }),
    },
  ];
}

export function AddQuestionMenu({ open, onClose, onAdd, locale }: { open: boolean; onClose: () => void; onAdd: (q: Question) => void; locale: string }) {
  const add = (q: Question) => {
    onAdd(q);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a question" size="lg">
      <div className="space-y-6">
        {CATEGORIES.map((cat) => (
          <section key={cat}>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{cat}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {QUESTION_TYPES.filter((t) => QUESTION_TYPE_META[t].category === cat).map((type: QuestionType) => {
                const Icon = QUESTION_ICONS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => add(createQuestion(type, locale))}
                    className="flex items-start gap-3 rounded-xl p-3 text-left ring-1 ring-stone-200 transition hover:bg-stone-50 hover:ring-stone-300 focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:outline-none"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-700">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-stone-900">{QUESTION_TYPE_META[type].label}</span>
                      <span className="block text-xs text-stone-500">{QUESTION_TYPE_META[type].description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase">
            <Sparkles className="size-3.5" /> Templates
          </h3>
          <div className="flex flex-wrap gap-2">
            {templates(locale).map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => add(tpl.build())}
                className="rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-800 transition hover:bg-stone-200"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Modal>
  );
}
