import type { Question, QuestionType, QuestionOf } from '@ff/form-schema';

export interface InputProps<T extends QuestionType = QuestionType> {
  q: QuestionOf<T>;
  value: unknown;
  onChange: (value: unknown) => void;
  /**
   * Ask the flow to move to the next step. `value` is passed explicitly because the parent
   * state may not have updated yet when auto-advancing right after a tap.
   */
  onAdvance?: (value: unknown) => void;
  locale: string;
  fallbackLocale: string;
  invalid: boolean;
  /** id of the element labelling this input (the question heading). */
  labelId: string;
  /** id of the error message, for aria-describedby. */
  errorId: string;
}

export type AnyInputProps = InputProps & { q: Question };
