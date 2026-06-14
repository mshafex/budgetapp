/**
 * Onboarding step 2 — fixed monthly costs (ONBOARDING).
 *
 * Add / list / remove recurring costs. Each item has: a label (TextInput), an amount in fils
 * (shared `AmountInput`, R3), a `FixedItemType` and a `CycleKind` (inline selectors built from
 * `Button`/`Pressable` + i18n labels — `CategoryPicker` is for expense categories, not this).
 *
 * An empty list is allowed (the user may have no fixed costs). Items are held in the draft
 * singleton and only persisted on the final step. All copy is i18n (`onboarding.fixed.*`,
 * `onboarding.cycle.*`, `categories.fixed.*`, `common.*`, `errors.*`) — no hardcoded strings
 * (R4). Layout uses logical start/end only (RTL-safe).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AmountInput, Button, ScreenContainer } from '@/components';
import type { CycleKind, FixedItemType } from '@/contracts';
import { ROUTES } from '@/contracts';
import { Money } from '@/money';
import { theme } from '@/theme';

import {
  onboardingStore,
  validateFixedAmountMinor,
  validateFixedLabel,
  type DraftFixedItem,
} from './state';
import { useOnboardingDraft } from './useOnboardingDraft';

/** Selectable fixed-item types, in display order. i18n key: `categories.fixed.<type>`. */
const FIXED_ITEM_TYPES: readonly FixedItemType[] = [
  'rent',
  'loan',
  'remittance',
  'bill',
  'other',
];

/** Selectable billing cadences, in display order. i18n key: `onboarding.cycle.<cycle>`. */
const CYCLE_KINDS: readonly CycleKind[] = ['weekly', 'monthly', 'quarterly', 'yearly'];

export default function OnboardingFixed() {
  const { t, i18n } = useTranslation();
  const draft = useOnboardingDraft();

  // Local add-form state. Defaults: a 'bill' that repeats 'monthly' (the common case).
  const [label, setLabel] = useState('');
  const [amountMinor, setAmountMinor] = useState(0);
  const [type, setType] = useState<FixedItemType>('bill');
  const [cycle, setCycle] = useState<CycleKind>('monthly');
  const [showError, setShowError] = useState(false);

  const labelError = validateFixedLabel(label);
  const amountError = validateFixedAmountMinor(amountMinor);
  const canAdd = !labelError && !amountError;

  const handleAdd = () => {
    if (!canAdd) {
      setShowError(true);
      return;
    }
    const item: DraftFixedItem = { label: label.trim(), amountMinor, type, cycle };
    onboardingStore.addFixedItem(item);
    // Reset the form for the next entry.
    setLabel('');
    setAmountMinor(0);
    setType('bill');
    setCycle('monthly');
    setShowError(false);
  };

  // The first validation message to surface (label first, then amount).
  const formError = labelError ?? amountError;

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('onboarding.fixed.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.fixed.subtitle')}</Text>

        {/* Add form */}
        <View style={styles.card}>
          <Text style={styles.addLabel}>{t('onboarding.fixed.addLabel')}</Text>

          <TextInput
            value={label}
            onChangeText={(next) => {
              setLabel(next);
              if (showError) setShowError(false);
            }}
            placeholder={t('onboarding.fixed.namePlaceholder')}
            placeholderTextColor={theme.colors.textSecondary}
            style={styles.textInput}
            accessibilityLabel={t('onboarding.fixed.namePlaceholder')}
          />

          <AmountInput
            valueMinor={amountMinor}
            onChangeMinor={(fils) => {
              setAmountMinor(fils);
              if (showError) setShowError(false);
            }}
            locale={i18n.language}
            placeholder={t('onboarding.fixed.amountPlaceholder')}
          />

          <Text style={styles.selectorLabel}>{t('onboarding.fixed.typeLabel')}</Text>
          <OptionSelector
            options={FIXED_ITEM_TYPES}
            value={type}
            onChange={setType}
            labelFor={(opt) => t(`categories.fixed.${opt}`)}
          />

          <Text style={styles.selectorLabel}>{t('onboarding.fixed.cycleLabel')}</Text>
          <OptionSelector
            options={CYCLE_KINDS}
            value={cycle}
            onChange={setCycle}
            labelFor={(opt) => t(`onboarding.cycle.${opt}`)}
          />

          {showError && formError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {t(formError)}
            </Text>
          ) : null}

          <Button
            label={t('common.add')}
            onPress={handleAdd}
            variant="secondary"
          />
        </View>

        {/* Current list */}
        {draft.fixedItems.length === 0 ? (
          <Text style={styles.empty}>{t('onboarding.fixed.empty')}</Text>
        ) : (
          <View style={styles.list}>
            {draft.fixedItems.map((item, index) => (
              <FixedItemRow
                key={`${item.label}-${index}`}
                item={item}
                typeLabel={t(`categories.fixed.${item.type}`)}
                cycleLabel={t(`onboarding.cycle.${item.cycle}`)}
                amountLabel={Money.fromFils(item.amountMinor).format(i18n.language)}
                removeLabel={t('common.remove')}
                onRemove={() => onboardingStore.removeFixedItemAt(index)}
              />
            ))}
          </View>
        )}

        <Text style={styles.hint}>{t('onboarding.fixed.hint')}</Text>
      </ScrollView>

      <Button label={t('common.next')} onPress={() => router.push(ROUTES.onboardingPayday)} />
    </ScreenContainer>
  );
}

/* ------------------------------------------------------------------ *
 * Inline single-select selector (Pressable chips). Generic over the option union so the
 * same control serves both FixedItemType and CycleKind. Labels arrive already localized.
 * ------------------------------------------------------------------ */
interface OptionSelectorProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labelFor: (option: T) => string;
}

function OptionSelector<T extends string>({
  options,
  value,
  onChange,
  labelFor,
}: OptionSelectorProps<T>) {
  return (
    <View style={styles.selectorRow}>
      {options.map((option) => {
        const selected = option === value;
        const optionLabel = labelFor(option);
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={optionLabel}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {optionLabel}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * A single added fixed-cost row with a remove control.
 * ------------------------------------------------------------------ */
interface FixedItemRowProps {
  item: DraftFixedItem;
  typeLabel: string;
  cycleLabel: string;
  amountLabel: string;
  removeLabel: string;
  onRemove: () => void;
}

function FixedItemRow({
  item,
  typeLabel,
  cycleLabel,
  amountLabel,
  removeLabel,
  onRemove,
}: FixedItemRowProps) {
  return (
    <View style={styles.itemRow}>
      <View style={styles.itemInfo}>
        <Text style={styles.itemLabel} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={styles.itemMeta}>
          {typeLabel} · {cycleLabel}
        </Text>
      </View>
      <Text style={styles.itemAmount}>{amountLabel}</Text>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        style={styles.removeButton}
      >
        <Text style={styles.removeText}>{removeLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.title,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  addLabel: {
    fontSize: theme.typography.body,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  textInput: {
    minHeight: 52,
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    textAlign: 'center',
  },
  selectorLabel: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  chipSelected: {
    borderColor: theme.colors.safe,
    backgroundColor: theme.colors.safe,
  },
  chipText: {
    fontSize: theme.typography.caption,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: theme.colors.safeOn,
  },
  error: {
    fontSize: theme.typography.caption,
    color: theme.colors.survival,
  },
  empty: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    fontSize: theme.typography.body,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  itemMeta: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  itemAmount: {
    fontSize: theme.typography.body,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  removeButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  removeText: {
    fontSize: theme.typography.caption,
    fontWeight: '700',
    color: theme.colors.survival,
  },
  hint: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
