/**
 * BigNumber (DESIGN) — The Number. The single biggest element on Home.
 * Implements `BigNumberProps` from `@/contracts/components`.
 *
 * - Renders `value.format(locale, { withFraction: false })` at display size.
 * - Colour is driven by `state`: calm `safe` vs urgent `survival` — readable in < 0.5s.
 * - `Money` is imported as a TYPE only; the runtime instance arrives via props and we
 *   call `.format(...)`. We never construct Money here (built by another worker).
 * - RTL-safe: centred, no left/right.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { BigNumberProps } from '@/contracts/components';
import type { Money } from '@/contracts'; // TYPE-only import
import { theme } from '@/theme';

export function BigNumber({ value, locale, state, caption }: BigNumberProps) {
  // `value: Money` — call the formatter the runtime impl provides. Whole dirhams for the
  // focal number (withFraction: false per the Money contract default, passed explicitly).
  const money: Money = value;
  const formatted = money.format(locale, { withFraction: false });
  const numberColor = state === 'survival' ? theme.colors.survival : theme.colors.safe;

  return (
    <View style={styles.wrap}>
      <Text
        style={[styles.number, { color: numberColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        // Localized, formatted money string is the accessible label.
        accessibilityRole="text"
        accessibilityLabel={formatted}
        allowFontScaling
      >
        {formatted}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontSize: theme.typography.display,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
    // Tabular figures keep the number from jittering as digits change.
    fontVariant: ['tabular-nums'],
  },
  caption: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});

export default BigNumber;
