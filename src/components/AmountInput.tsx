/**
 * AmountInput (DESIGN) — controlled money entry, in integer fils (R3).
 * Implements `AmountInputProps` from `@/contracts/components`.
 *
 * - Controlled value is `valueMinor` (fils). The user types free text; `parseAmountToFils`
 *   turns it into fils and we report up via `onChangeMinor`.
 * - Local text mirrors what the user typed so intermediate states like "5." or "0.0" are
 *   not clobbered. We only re-seed from `valueMinor` when the parent value diverges from
 *   what the current text parses to (e.g. an external reset to 0).
 * - `placeholder` arrives already localized; no hardcoded visible text.
 * - RTL-safe: numeric entry, symmetric layout, no left/right.
 *
 * The pure parser is exported from `./parseAmount` and re-exported here for convenience.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import type { AmountInputProps } from '@/contracts/components';
import { theme } from '@/theme';

import { parseAmountToFils } from './parseAmount';

export { parseAmountToFils } from './parseAmount';

export function AmountInput({
  valueMinor,
  onChangeMinor,
  locale,
  autoFocus = false,
  placeholder,
}: AmountInputProps) {
  const [text, setText] = useState<string>(() => initialText(valueMinor));
  // Track the fils the current text represents, to detect external value changes.
  const lastReportedMinor = useRef<number>(valueMinor);

  // Re-seed local text when the parent value changes to something our text doesn't match
  // (external reset / programmatic set). Avoids clobbering in-progress typing like "5.".
  useEffect(() => {
    if (valueMinor !== lastReportedMinor.current) {
      setText(initialText(valueMinor));
      lastReportedMinor.current = valueMinor;
    }
  }, [valueMinor]);

  const handleChange = (next: string) => {
    setText(next);
    const fils = parseAmountToFils(next, locale);
    lastReportedMinor.current = fils;
    onChangeMinor(fils);
  };

  return (
    <TextInput
      value={text}
      onChangeText={handleChange}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.textSecondary}
      keyboardType="decimal-pad"
      inputMode="decimal"
      autoFocus={autoFocus}
      style={styles.input}
      // Center keeps the figure prominent and reads correctly in both LTR and RTL.
      textAlign="center"
      accessibilityLabel={placeholder}
    />
  );
}

/** Text shown for a given fils value. 0 → empty so the placeholder shows. */
function initialText(valueMinor: number): string {
  if (!valueMinor) return '';
  const major = Math.trunc(valueMinor / 100);
  const fils = Math.abs(valueMinor % 100);
  if (fils === 0) return String(major);
  return `${major}.${String(fils).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  input: {
    minHeight: 64,
    fontSize: theme.typography.title,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontVariant: ['tabular-nums'],
  },
});

export default AmountInput;
