import { z } from 'zod';

/**
 * Stable identity of a question / option across ALL form versions.
 * Position in the list is never identity — reordering must not change meaning.
 */
export const UID_RE = /^[a-z][a-z0-9_]{3,39}$/;
export const Uid = z.string().regex(UID_RE, 'Invalid id');

/** Localised text, e.g. { en: "Hello", hi: "नमस्ते", mr: "नमस्कार" }. */
export const I18nText = z.record(z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/), z.string().max(2000));
export type I18nText = z.infer<typeof I18nText>;

export const ChoiceOption = z.object({
  uid: Uid,
  label: I18nText,
  /** Shows a free-text box when selected ("Other – please specify"). */
  isOther: z.boolean().optional(),
  /** Multi-choice only: cannot be combined with other options ("None of these"). */
  exclusive: z.boolean().optional(),
});
export type ChoiceOption = z.infer<typeof ChoiceOption>;

const Options = z.array(ChoiceOption).max(50);

const base = {
  uid: Uid,
  label: I18nText,
  help: I18nText.optional(),
  required: z.boolean(),
};

export const SectionQuestion = z.object({ ...base, type: z.literal('section') });
export const SingleChoiceQuestion = z.object({
  ...base,
  type: z.literal('single_choice'),
  options: Options,
  layout: z.enum(['list', 'chips']).optional(),
});
export const MultiChoiceQuestion = z.object({
  ...base,
  type: z.literal('multi_choice'),
  options: Options,
  minSelect: z.number().int().min(0).max(50).optional(),
  maxSelect: z.number().int().min(1).max(50).optional(),
});
export const DropdownQuestion = z.object({
  ...base,
  type: z.literal('dropdown'),
  options: Options,
  placeholder: I18nText.optional(),
});
export const ShortTextQuestion = z.object({
  ...base,
  type: z.literal('short_text'),
  format: z.enum(['any', 'name']).optional(),
  maxLength: z.number().int().min(1).max(500).optional(),
  placeholder: I18nText.optional(),
});
export const LongTextQuestion = z.object({
  ...base,
  type: z.literal('long_text'),
  maxLength: z.number().int().min(1).max(5000).optional(),
  placeholder: I18nText.optional(),
});
export const EmailQuestion = z.object({
  ...base,
  type: z.literal('email'),
  placeholder: I18nText.optional(),
});
export const PhoneQuestion = z.object({
  ...base,
  type: z.literal('phone'),
  /** ISO-3166 alpha-2, e.g. "IN". */
  defaultCountry: z.string().regex(/^[A-Z]{2}$/).optional(),
});
export const NumberQuestion = z.object({
  ...base,
  type: z.literal('number'),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  unit: I18nText.optional(),
});
export const SliderQuestion = z.object({
  ...base,
  type: z.literal('slider'),
  min: z.number(),
  max: z.number(),
  step: z.number(),
  minLabel: I18nText.optional(),
  maxLabel: I18nText.optional(),
  unit: I18nText.optional(),
});
export const RatingQuestion = z.object({
  ...base,
  type: z.literal('rating'),
  max: z.number().int().min(3).max(10),
});
export const EmojiQuestion = z.object({ ...base, type: z.literal('emoji') });
export const NpsQuestion = z.object({
  ...base,
  type: z.literal('nps'),
  lowLabel: I18nText.optional(),
  highLabel: I18nText.optional(),
});
export const YesNoQuestion = z.object({ ...base, type: z.literal('yes_no') });
export const DateQuestion = z.object({
  ...base,
  type: z.literal('date'),
  disallowFuture: z.boolean().optional(),
  disallowPast: z.boolean().optional(),
});
/** The question label is the consent statement; the answer is `true` when ticked. */
export const ConsentQuestion = z.object({ ...base, type: z.literal('consent') });

export const Question = z.discriminatedUnion('type', [
  SingleChoiceQuestion,
  MultiChoiceQuestion,
  DropdownQuestion,
  ShortTextQuestion,
  LongTextQuestion,
  EmailQuestion,
  PhoneQuestion,
  NumberQuestion,
  SliderQuestion,
  RatingQuestion,
  EmojiQuestion,
  NpsQuestion,
  YesNoQuestion,
  DateQuestion,
  ConsentQuestion,
  SectionQuestion,
]);
export type Question = z.infer<typeof Question>;
export type QuestionType = Question['type'];
export type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;
export type ChoiceQuestion = QuestionOf<'single_choice' | 'multi_choice' | 'dropdown'>;

export const QUESTION_TYPES = [
  'single_choice',
  'multi_choice',
  'dropdown',
  'short_text',
  'long_text',
  'email',
  'phone',
  'number',
  'slider',
  'rating',
  'emoji',
  'nps',
  'yes_no',
  'date',
  'consent',
  'section',
] as const satisfies readonly QuestionType[];

export const CHOICE_TYPES: readonly QuestionType[] = ['single_choice', 'multi_choice', 'dropdown'];
export function isChoiceQuestion(q: Question): q is ChoiceQuestion {
  return CHOICE_TYPES.includes(q.type);
}

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');

export const Theme = z.object({
  /** Only assets uploaded through the API are allowed (no arbitrary external URLs). */
  logoUrl: z
    .string()
    .regex(/^\/api\/assets\/[a-zA-Z0-9._-]{1,100}$/)
    .nullable(),
  primaryColor: HexColor,
  welcome: z.object({ title: I18nText, subtitle: I18nText, buttonText: I18nText }),
  thankYou: z.object({ title: I18nText, message: I18nText }),
});
export type Theme = z.infer<typeof Theme>;

export const FormSettings = z.object({
  /** Kiosk: seconds without interaction before "Are you still there?". */
  idleTimeoutSec: z.number().int().min(15).max(600),
  /** Kiosk: seconds the thank-you screen stays before returning to welcome. */
  thankYouSec: z.number().int().min(3).max(60),
});
export type FormSettings = z.infer<typeof FormSettings>;

/** Full content of one form version. Published versions are immutable. */
export const FormDoc = z.object({
  schemaVersion: z.literal(1),
  defaultLocale: z.string().min(2).max(10),
  locales: z.array(z.string().min(2).max(10)).min(1).max(10),
  theme: Theme,
  settings: FormSettings,
  questions: z.array(Question).max(200),
});
export type FormDoc = z.infer<typeof FormDoc>;

/** Body of POST /submissions (kiosk + public). `id` is generated on the device → idempotency key. */
export const SubmissionPayload = z.object({
  id: z.string().uuid(),
  versionId: z.string().min(1).max(64),
  locale: z.string().min(2).max(10),
  startedAt: z.string().datetime({ offset: true }).optional(),
  deviceSubmittedAt: z.string().datetime({ offset: true }).optional(),
  durationMs: z.number().int().min(0).max(86_400_000).optional(),
  answers: z
    .array(z.object({ questionUid: z.string().min(1).max(64), value: z.unknown() }))
    .max(300),
});
export type SubmissionPayload = z.infer<typeof SubmissionPayload>;
