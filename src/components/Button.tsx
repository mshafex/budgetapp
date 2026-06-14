/**
 * Button (DESIGN) — primary action control.
 * Implements `ButtonProps` from `@/contracts/components`.
 *
 * - Variants: `primary` (solid safe accent), `secondary` (outlined/neutral),
 *   `danger` (solid survival accent — destructive actions).
 * - `label` arrives already localized; we never hardcode visible text.
 * - RTL-safe: centred content, symmetric padding, no left/right.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import type { ButtonProps } from '@/contracts/components';
import { theme } from '@/theme';

export function Button({ label, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  const palette = VARIANTS[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const VARIANTS: Record<
  NonNullable<ButtonProps['variant']>,
  { bg: string; fg: string; border: string }
> = {
  primary: {
    bg: theme.colors.safe,
    fg: theme.colors.safeOn,
    border: theme.colors.safe,
  },
  secondary: {
    bg: 'transparent',
    fg: theme.colors.textPrimary,
    border: theme.colors.border,
  },
  danger: {
    bg: theme.colors.survival,
    fg: theme.colors.survivalOn,
    border: theme.colors.survival,
  },
};

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: theme.typography.body,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default Button;
