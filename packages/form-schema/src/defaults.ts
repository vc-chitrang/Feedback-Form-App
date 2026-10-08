import type { ChoiceOption, FormDoc, Question, QuestionOf, QuestionType } from './types';
import { newUid } from './utils';

export interface QuestionTypeMeta {
  label: string;
  description: string;
  category: 'Choice' | 'Text' | 'Contact' | 'Scale' | 'Other';
}

export const QUESTION_TYPE_META: Record<QuestionType, QuestionTypeMeta> = {
  single_choice: { label: 'Single choice', description: 'Pick one option (radio)', category: 'Choice' },
  multi_choice: { label: 'Multiple choice', description: 'Pick several options (checkbox)', category: 'Choice' },
  dropdown: { label: 'Dropdown', description: 'Pick one from a long list', category: 'Choice' },
  yes_no: { label: 'Yes / No', description: 'Two big buttons', category: 'Choice' },
  short_text: { label: 'Short text', description: 'Name, city, area…', category: 'Text' },
  long_text: { label: 'Long text', description: 'Comments and suggestions', category: 'Text' },
  number: { label: 'Number', description: 'Group size, number of children', category: 'Text' },
  date: { label: 'Date', description: 'Visit date', category: 'Text' },
  email: { label: 'Email', description: 'Validated email address', category: 'Contact' },
  phone: { label: 'Mobile number', description: 'With country code', category: 'Contact' },
  consent: { label: 'Consent', description: 'Tick box to agree', category: 'Contact' },
  rating: { label: 'Star rating', description: '1–5 stars (or up to 10)', category: 'Scale' },
  emoji: { label: 'Smiley scale', description: '5 faces — works in any language', category: 'Scale' },
  nps: { label: 'Recommend (NPS)', description: '0–10 “would you recommend us?”', category: 'Scale' },
  slider: { label: 'Slider', description: 'Pick a value on a range', category: 'Scale' },
  section: { label: 'Section / info', description: 'Heading or info text, no answer', category: 'Other' },
};

const L = (locale: string, text: string) => ({ [locale]: text });

export function createOption(locale: string, text = ''): ChoiceOption {
  return { uid: newUid('o'), label: L(locale, text) };
}

/** A blank question of the given type with sensible defaults. */
export function createQuestion<T extends QuestionType>(type: T, locale = 'en'): QuestionOf<T> {
  const base = { uid: newUid('q'), label: L(locale, ''), required: false };
  const options = (n: number) => Array.from({ length: n }, (_, i) => createOption(locale, `Option ${i + 1}`));
  let q: Question;
  switch (type as QuestionType) {
    case 'single_choice':
      q = { ...base, type: 'single_choice', options: options(2), layout: 'list' };
      break;
    case 'multi_choice':
      q = { ...base, type: 'multi_choice', options: options(3) };
      break;
    case 'dropdown':
      q = { ...base, type: 'dropdown', options: options(3) };
      break;
    case 'short_text':
      q = { ...base, type: 'short_text', format: 'any', maxLength: 100 };
      break;
    case 'long_text':
      q = { ...base, type: 'long_text', maxLength: 1000 };
      break;
    case 'email':
      q = { ...base, type: 'email' };
      break;
    case 'phone':
      q = { ...base, type: 'phone', defaultCountry: 'IN' };
      break;
    case 'number':
      q = { ...base, type: 'number', min: 0, integer: true };
      break;
    case 'slider':
      q = { ...base, type: 'slider', min: 0, max: 100, step: 1 };
      break;
    case 'rating':
      q = { ...base, type: 'rating', max: 5 };
      break;
    case 'emoji':
      q = { ...base, type: 'emoji' };
      break;
    case 'nps':
      q = { ...base, type: 'nps', lowLabel: L(locale, 'Not likely'), highLabel: L(locale, 'Extremely likely') };
      break;
    case 'yes_no':
      q = { ...base, type: 'yes_no' };
      break;
    case 'date':
      q = { ...base, type: 'date', disallowFuture: true };
      break;
    case 'consent':
      q = { ...base, type: 'consent' };
      break;
    case 'section':
      q = { ...base, type: 'section' };
      break;
  }
  return q as QuestionOf<T>;
}

export function createDefaultDoc(orgName: string, locale = 'en'): FormDoc {
  return {
    schemaVersion: 1,
    defaultLocale: locale,
    locales: [locale],
    theme: {
      logoUrl: null,
      primaryColor: '#7a1f2b',
      welcome: {
        title: L(locale, `Welcome to ${orgName}`),
        subtitle: L(locale, 'We would love to hear about your visit. It only takes a minute.'),
        buttonText: L(locale, 'Start'),
      },
      thankYou: {
        title: L(locale, 'Thank you!'),
        message: L(locale, 'Your feedback helps us make every visit better.'),
      },
    },
    settings: { idleTimeoutSec: 60, thankYouSec: 8 },
    questions: [],
  };
}

/** Starter museum form used when a new organisation is bootstrapped. */
export function createSampleDoc(orgName: string, locale = 'en'): FormDoc {
  const doc = createDefaultDoc(orgName, locale);
  const opts = (...labels: string[]) => labels.map((l) => createOption(locale, l));

  const rating = createQuestion('rating', locale);
  rating.label = L(locale, 'How would you rate your overall visit?');
  rating.required = true;

  const visitedWith = createQuestion('single_choice', locale);
  visitedWith.label = L(locale, 'Who did you visit with today?');
  visitedWith.required = true;
  visitedWith.options = opts('On my own', 'Family', 'Friends', 'School group', 'Tour group');

  const galleries = createQuestion('multi_choice', locale);
  galleries.label = L(locale, 'Which galleries did you enjoy the most?');
  galleries.help = L(locale, 'Choose up to 3');
  galleries.maxSelect = 3;
  galleries.options = [
    ...opts('Sculpture', 'Miniature paintings', 'Natural history', 'Decorative art', 'Coins & currency'),
    { ...createOption(locale, 'Other'), isOther: true },
  ];

  const age = createQuestion('single_choice', locale);
  age.label = L(locale, 'Your age group');
  age.layout = 'chips';
  age.options = opts('Under 12', '12–17', '18–24', '25–34', '35–49', '50–64', '65+');

  const nps = createQuestion('nps', locale);
  nps.label = L(locale, 'How likely are you to recommend us to friends or family?');

  const improve = createQuestion('long_text', locale);
  improve.label = L(locale, 'Is there anything we could do better?');
  improve.placeholder = L(locale, 'Your suggestions…');

  const contact = createQuestion('section', locale);
  contact.label = L(locale, 'Stay in touch (optional)');
  contact.help = L(locale, 'Leave your details if you would like to hear about new exhibitions.');

  const name = createQuestion('short_text', locale);
  name.label = L(locale, 'Your name');
  name.format = 'name';

  const email = createQuestion('email', locale);
  email.label = L(locale, 'Email address');

  const phone = createQuestion('phone', locale);
  phone.label = L(locale, 'Mobile number');

  const consent = createQuestion('consent', locale);
  consent.label = L(locale, `I agree that ${orgName} may contact me about events and exhibitions.`);

  doc.questions = [rating, visitedWith, galleries, age, nps, improve, contact, name, email, phone, consent];
  return doc;
}
