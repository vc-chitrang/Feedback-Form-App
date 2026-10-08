import type { ComponentType } from 'react';
import type { QuestionType } from '@ff/form-schema';
import { ConsentInput, DropdownInput, MultiChoiceInput, SingleChoiceInput, YesNoInput } from './inputs/ChoiceInputs';
import { DateInput, EmailInput, LongTextInput, NumberInput, PhoneInput, ShortTextInput } from './inputs/TextInputs';
import { EmojiInput, NpsInput, RatingInput, SliderInput } from './inputs/ScaleInputs';
import type { AnyInputProps, InputProps } from './inputs/types';

const INPUTS: { [K in QuestionType]: ComponentType<InputProps<K>> | null } = {
  single_choice: SingleChoiceInput,
  multi_choice: MultiChoiceInput,
  dropdown: DropdownInput,
  yes_no: YesNoInput,
  consent: ConsentInput,
  short_text: ShortTextInput,
  long_text: LongTextInput,
  email: EmailInput,
  phone: PhoneInput,
  number: NumberInput,
  date: DateInput,
  rating: RatingInput,
  emoji: EmojiInput,
  nps: NpsInput,
  slider: SliderInput,
  section: null,
};

/** Renders the right control for any question type. */
export function QuestionInput(props: AnyInputProps) {
  const Comp = INPUTS[props.q.type] as ComponentType<AnyInputProps> | null;
  return Comp ? <Comp {...props} /> : null;
}

/** Types that move to the next question as soon as the visitor taps an answer. */
export const AUTO_ADVANCE_TYPES: readonly QuestionType[] = ['single_choice', 'yes_no', 'rating', 'emoji', 'nps'];
