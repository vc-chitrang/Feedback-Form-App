import { isChoiceQuestion, type FormDoc, type Question, type QuestionType } from './types';
import { stableStringify, t } from './utils';

export interface PublishIssue {
  /** `error` blocks publishing; `warning` is shown but allowed. */
  severity: 'error' | 'warning';
  questionUid?: string;
  message: string;
}

function questionName(q: Question, index: number, locale: string): string {
  const label = t(q.label, locale).trim();
  const short = label.length > 40 ? `${label.slice(0, 40)}…` : label;
  return short ? `Q${index + 1} “${short}”` : `Q${index + 1}`;
}

/**
 * Rules a draft must pass before it can go live.
 * @param knownTypes question uid → type, from every previously published version. A uid must
 *   never change type, otherwise old and new answers under the same id would mean different things.
 */
export function validateForPublish(doc: FormDoc, knownTypes: Record<string, QuestionType> = {}): PublishIssue[] {
  const issues: PublishIssue[] = [];
  const L = doc.defaultLocale;
  const error = (message: string, questionUid?: string) => issues.push({ severity: 'error', message, questionUid });
  const warn = (message: string, questionUid?: string) => issues.push({ severity: 'warning', message, questionUid });

  if (!t(doc.theme.welcome.title, L).trim()) error('The welcome screen title is empty.');
  if (!doc.questions.some((q) => q.type !== 'section')) error('Add at least one question before publishing.');

  const seen = new Set<string>();
  doc.questions.forEach((q, i) => {
    const name = questionName(q, i, L);
    if (seen.has(q.uid)) error(`${name}: duplicate question id.`, q.uid);
    seen.add(q.uid);

    if (!t(q.label, L).trim()) error(`${name}: question text is empty.`, q.uid);

    const previousType = knownTypes[q.uid];
    if (previousType && previousType !== q.type) {
      error(`${name}: type changed from "${previousType}" to "${q.type}". Changing the type must create a new question.`, q.uid);
    }

    if (isChoiceQuestion(q)) {
      if (q.options.length < 2) error(`${name}: add at least 2 options.`, q.uid);
      const labels = new Set<string>();
      const optionUids = new Set<string>();
      q.options.forEach((o, oi) => {
        const label = t(o.label, L).trim().toLowerCase();
        if (!label) error(`${name}: option ${oi + 1} has no text.`, q.uid);
        else if (labels.has(label)) error(`${name}: option “${t(o.label, L)}” appears twice.`, q.uid);
        labels.add(label);
        if (optionUids.has(o.uid)) error(`${name}: duplicate option id.`, q.uid);
        optionUids.add(o.uid);
      });
      if (q.options.filter((o) => o.isOther).length > 1) error(`${name}: only one “Other” option is allowed.`, q.uid);
    }

    switch (q.type) {
      case 'multi_choice': {
        const n = q.options.length;
        if (q.minSelect !== undefined && q.maxSelect !== undefined && q.minSelect > q.maxSelect) {
          error(`${name}: minimum selections is greater than maximum.`, q.uid);
        }
        if (q.minSelect !== undefined && q.minSelect > n) error(`${name}: minimum selections exceeds the number of options.`, q.uid);
        if (q.maxSelect !== undefined && q.maxSelect > n) warn(`${name}: maximum selections exceeds the number of options.`, q.uid);
        if (q.required && q.minSelect === 0) warn(`${name}: required, but minimum selections is 0.`, q.uid);
        break;
      }
      case 'slider': {
        if (!(q.min < q.max)) error(`${name}: slider minimum must be less than maximum.`, q.uid);
        else if (!(q.step > 0) || q.step > q.max - q.min) error(`${name}: slider step must be between 0 and ${q.max - q.min}.`, q.uid);
        else {
          const steps = (q.max - q.min) / q.step;
          if (Math.abs(steps - Math.round(steps)) > 1e-6) warn(`${name}: the maximum cannot be reached with this step size.`, q.uid);
        }
        break;
      }
      case 'number':
        if (q.min !== undefined && q.max !== undefined && q.min > q.max) error(`${name}: minimum is greater than maximum.`, q.uid);
        break;
      case 'date':
        if (q.disallowFuture && q.disallowPast) error(`${name}: cannot block both past and future dates.`, q.uid);
        break;
      case 'consent':
        if (q.required) warn(`${name}: a required consent forces visitors to agree. Consider making it optional.`, q.uid);
        break;
    }
  });

  const collectsContact = doc.questions.some((q) => q.type === 'email' || q.type === 'phone');
  if (collectsContact && !doc.questions.some((q) => q.type === 'consent')) {
    warn('This form collects email or phone numbers but has no consent question (recommended under India’s DPDP Act 2023).');
  }
  return issues;
}

export interface DocDiff {
  added: Question[];
  removed: Question[];
  modified: Question[];
  reordered: boolean;
  themeChanged: boolean;
  settingsChanged: boolean;
  hasChanges: boolean;
}

/** What changes if `next` replaces `base` (questions matched by uid, never by position). */
export function diffDocs(base: FormDoc | null, next: FormDoc): DocDiff {
  const baseQs = base?.questions ?? [];
  const baseMap = new Map(baseQs.map((q) => [q.uid, q]));
  const nextMap = new Map(next.questions.map((q) => [q.uid, q]));

  const added = next.questions.filter((q) => !baseMap.has(q.uid));
  const removed = baseQs.filter((q) => !nextMap.has(q.uid));
  const modified = next.questions.filter(
    (q) => baseMap.has(q.uid) && stableStringify(baseMap.get(q.uid)) !== stableStringify(q),
  );
  const commonBase = baseQs.filter((q) => nextMap.has(q.uid)).map((q) => q.uid);
  const commonNext = next.questions.filter((q) => baseMap.has(q.uid)).map((q) => q.uid);
  const reordered = commonBase.join('|') !== commonNext.join('|');
  const themeChanged = stableStringify(base?.theme) !== stableStringify(next.theme);
  const settingsChanged = stableStringify(base?.settings) !== stableStringify(next.settings);
  return {
    added,
    removed,
    modified,
    reordered,
    themeChanged,
    settingsChanged,
    hasChanges: added.length + removed.length + modified.length > 0 || reordered || themeChanged || settingsChanged,
  };
}
