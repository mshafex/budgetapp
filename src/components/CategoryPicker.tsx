/**
 * CategoryPicker (DESIGN) — pick one `ExpenseCategory`.
 * Implements `CategoryPickerProps` from `@/contracts/components`.
 *
 * - Renders every `ExpenseCategory` as a selectable chip; single selection.
 * - Labels are localized via the `categories` i18n namespace (keyed by category id) so no
 *   visible text is hardcoded (R4). The component owns the fixed category list from the
 *   contract; only the human-readable label comes from i18n.
 * - Selected chip uses the calm `safe` accent (neutral selection — not a status signal).
 * - RTL-safe: a wrapping row driven by flexbox; logical gaps only, no left/right.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CategoryPickerProps } from '@/contracts/components';
import type { ExpenseCategory } from '@/contracts';
import { theme } from '@/theme';

// Fixed set from the entities contract. Order is presentation-only.
const CATEGORIES: readonly ExpenseCategory[] = [
  'food',
  'transport',
  'bills',
  'shopping',
  'health',
  'family',
  'other',
];

export function CategoryPicker({ value, onChange, locale }: CategoryPickerProps) {
  // Read labels from the active i18n resources; `locale` selects which language.
  const { t } = useTranslation();

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {CATEGORIES.map((category) => {
        const selected = category === value;
        const label = t(`categories.${category}`, { lng: locale });
        return (
          <Pressable
            key={category}
            onPress={() => onChange(category)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            style={[
              styles.chip,
              selected ? styles.chipSelected : styles.chipUnselected,
            ]}
          >
            <Text
              style={[styles.label, selected ? styles.labelSelected : styles.labelUnselected]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  chipSelected: {
    backgroundColor: theme.colors.safe,
    borderColor: theme.colors.safe,
  },
  chipUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  label: {
    fontSize: theme.typography.body,
    fontWeight: '600',
  },
  labelSelected: {
    color: theme.colors.safeOn,
  },
  labelUnselected: {
    color: theme.colors.textPrimary,
  },
});

export default CategoryPicker;
