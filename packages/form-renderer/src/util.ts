import type { CSSProperties } from 'react';
import type { Theme } from '@ff/form-schema';

/** Join class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Inline style that feeds the form theme into the `--brand` CSS variable. */
export function themeStyle(theme: Pick<Theme, 'primaryColor'>): CSSProperties {
  return { ['--brand' as string]: theme.primaryColor } as CSSProperties;
}

/** Shared focus ring for every interactive control. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 focus-visible:ring-offset-2';
