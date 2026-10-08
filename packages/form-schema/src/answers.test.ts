import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  createDefaultDoc,
  createQuestion,
  createSampleDoc,
  diffDocs,
  FormDoc,
  suggestEmail,
  validateForPublish,
  validateSubmission,
} from './index';

const today = { earliest: '2026-10-08', latest: '2026-10-08' };

describe('checkAnswer – text', () => {
  const name = { ...createQuestion('short_text'), format: 'name' as const, required: true };

  it.each(["D'Souza", 'Ram-Charan', 'श्रीकांत', 'José Álvarez', 'Mary-Jane O’Neil'])('accepts name %s', (v) => {
    expect(checkAnswer(name, v)).toEqual({ ok: true, value: v });
  });

  it('trims and collapses whitespace', () => {
    expect(checkAnswer(name, '  Asha   Rao ')).toEqual({ ok: true, value: 'Asha Rao' });
  });

  it.each(['1234', '😀😀', '<script>', '-abc'])('rejects name %s', (v) => {
    expect(checkAnswer(name, v).ok).toBe(false);
  });

  it('enforces max length in characters', () => {
    expect(checkAnswer({ ...name, maxLength: 5 }, 'abcdef').ok).toBe(false);
  });

  it('required blank fails, optional blank is null', () => {
    expect(checkAnswer(name, '   ').ok).toBe(false);
    expect(checkAnswer({ ...name, required: false }, '   ')).toEqual({ ok: true, value: null });
  });
});

describe('checkAnswer – email & phone', () => {
  const email = createQuestion('email');
  const phone = createQuestion('phone');

  it('normalises email', () => {
    expect(checkAnswer(email, ' A@B.COM ')).toEqual({ ok: true, value: 'a@b.com' });
  });
  it.each(['a@b', 'a@@b.com', 'a b@c.com', 'a..b@c.com', `${'x'.repeat(250)}@a.com`])('rejects email %s', (v) => {
    expect(checkAnswer(email, v).ok).toBe(false);
  });
  it('suggests common domain typos', () => {
    expect(suggestEmail('asha@gmial.com')).toBe('asha@gmail.com');
    expect(suggestEmail('asha@gmail.com')).toBeNull();
  });

  it('stores phone as E.164', () => {
    expect(checkAnswer(phone, '+91 98200 12345')).toEqual({ ok: true, value: '+919820012345' });
  });
  it.each(['12345', '+91 98200', 'abcdefghij'])('rejects phone %s', (v) => {
    expect(checkAnswer(phone, v).ok).toBe(false);
  });
});

describe('checkAnswer – scales', () => {
  it('slider must be touched when required and respect step', () => {
    const s = { ...createQuestion('slider'), required: true, min: 0, max: 10, step: 2 };
    expect(checkAnswer(s, null).ok).toBe(false);
    expect(checkAnswer(s, 4)).toEqual({ ok: true, value: 4 });
    expect(checkAnswer(s, 3).ok).toBe(false);
    expect(checkAnswer(s, 12).ok).toBe(false);
  });
  it('rating range', () => {
    const r = createQuestion('rating');
    expect(checkAnswer(r, 5).ok).toBe(true);
    expect(checkAnswer(r, 0).ok).toBe(false);
    expect(checkAnswer(r, 6).ok).toBe(false);
    expect(checkAnswer(r, 2.5).ok).toBe(false);
  });
  it('nps range', () => {
    const n = createQuestion('nps');
    expect(checkAnswer(n, 0).ok).toBe(true);
    expect(checkAnswer(n, 11).ok).toBe(false);
  });
});

describe('checkAnswer – choices', () => {
  const multi = createQuestion('multi_choice');
  multi.options[2]!.exclusive = true; // "None of these"
  multi.maxSelect = 2;
  const [a, b, none] = multi.options.map((o) => o.uid) as [string, string, string];

  it('accepts valid selection in option order', () => {
    expect(checkAnswer(multi, { optionUids: [b, a] })).toEqual({ ok: true, value: { optionUids: [a, b] } });
  });
  it('rejects exclusive combined with others', () => {
    expect(checkAnswer(multi, { optionUids: [a, none] }).ok).toBe(false);
  });
  it('rejects unknown option and too many', () => {
    expect(checkAnswer(multi, { optionUids: ['o_nope123'] }).ok).toBe(false);
    expect(checkAnswer({ ...multi, maxSelect: 1 }, { optionUids: [a, b] }).ok).toBe(false);
  });
  it('requires text for Other', () => {
    const single = createQuestion('single_choice');
    single.options[1]!.isOther = true;
    const other = single.options[1]!.uid;
    expect(checkAnswer(single, { optionUid: other }).ok).toBe(false);
    expect(checkAnswer(single, { optionUid: other, otherText: ' Cafe ' })).toEqual({
      ok: true,
      value: { optionUid: other, otherText: 'Cafe' },
    });
  });
});

describe('checkAnswer – date', () => {
  const d = createQuestion('date'); // disallowFuture
  it('rejects future and invalid dates', () => {
    expect(checkAnswer(d, '2026-10-09', { today }).ok).toBe(false);
    expect(checkAnswer(d, '2026-02-30', { today }).ok).toBe(false);
    expect(checkAnswer(d, '2026-10-01', { today }).ok).toBe(true);
  });
});

describe('validateSubmission', () => {
  const doc = createSampleDoc('Test Museum');
  const [rating, visitedWith] = doc.questions as [any, any];

  it('accepts a minimal valid submission', () => {
    const r = validateSubmission(doc, [
      { questionUid: rating.uid, value: 5 },
      { questionUid: visitedWith.uid, value: { optionUid: visitedWith.options[0].uid } },
    ]);
    expect(r.ok).toBe(true);
  });

  it('rejects unknown questions, duplicates and missing required', () => {
    const r = validateSubmission(doc, [
      { questionUid: rating.uid, value: 5 },
      { questionUid: rating.uid, value: 4 },
      { questionUid: 'q_tampered', value: 'x' },
    ]);
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toEqual(expect.arrayContaining([rating.uid, 'q_tampered', visitedWith.uid]));
  });
});

describe('validateForPublish', () => {
  it('blocks empty form and bad questions', () => {
    const doc: FormDoc = createDefaultDoc('X');
    expect(validateForPublish(doc).some((i) => i.severity === 'error')).toBe(true);

    const radio = createQuestion('single_choice');
    radio.label = { en: 'Pick' };
    radio.options = radio.options.slice(0, 1);
    const slider = { ...createQuestion('slider'), label: { en: 'S' }, min: 10, max: 5 };
    doc.questions = [radio, slider];
    const errors = validateForPublish(doc).filter((i) => i.severity === 'error');
    expect(errors.map((e) => e.questionUid)).toEqual([radio.uid, slider.uid]);
  });

  it('blocks a type change of an existing question uid', () => {
    const doc = createSampleDoc('X');
    const q = doc.questions[0]!;
    const issues = validateForPublish(doc, { [q.uid]: 'short_text' });
    expect(issues.some((i) => i.severity === 'error' && i.questionUid === q.uid)).toBe(true);
  });

  it('sample doc is publishable', () => {
    const doc = createSampleDoc('X');
    expect(validateForPublish(doc).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('diffDocs', () => {
  it('detects add / remove / reorder by uid', () => {
    const base = createSampleDoc('X');
    const next: FormDoc = JSON.parse(JSON.stringify(base));
    const removed = next.questions.splice(1, 1)[0]!;
    next.questions.reverse();
    const added = { ...createQuestion('yes_no'), label: { en: 'New?' } };
    next.questions.push(added);
    const d = diffDocs(base, next);
    expect(d.removed.map((q) => q.uid)).toEqual([removed.uid]);
    expect(d.added.map((q) => q.uid)).toEqual([added.uid]);
    expect(d.reordered).toBe(true);
    expect(d.modified).toEqual([]);
  });
});
