/**
 * Add-expense screen (LOGGING) — log a spend in ≤ 2 taps.
 *
 * Flow: amount is auto-focused, category is one tap (default `food`), optional
 * note, then Save. On save we validate the amount, persist via the repository,
 * and return to Home (which refreshes its number on focus).
 *
 * Constraints honoured here:
 *  - R3: money stays integer fils — `AmountInput` is controlled in fils and we
 *    never do float math on it.
 *  - R4: every visible string comes from i18n (`log.*` / `errors.*`); layout uses
 *    logical column flex + symmetric padding, never left/right.
 *  - R6: informational only — no advice copy, no money movement.
 *
 * Data access is repository-only (PATTERNS) — no raw queries in the screen.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AmountInput, Button, CategoryPicker, ScreenContainer } from '@/components';
import type { ExpenseCategory } from '@/contracts';
import { ROUTES } from '@/contracts';
import { ensureSchema, repository } from '@/db';
import { theme } from '@/theme';

import { buildExpenseInput, isAmountValid } from './logForm';

export default function Log() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [amountMinor, setAmountMinor] = useState<number>(0);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const handleSave = async () => {
    // Ignore re-taps while a save is already in flight.
    if (saving) return;

    if (!isAmountValid(amountMinor)) {
      setError(t('errors.amountTooLow'));
      return;
    }

    setError(null);
    setSaving(true);
    try {
      // Idempotent bootstrap; safe to call before each write.
      ensureSchema();
      await repository.addExpense(buildExpenseInput({ amountMinor, category, note }));
      router.back();
    } catch {
      // Persisting failed — keep the user on the screen with their input intact.
      setError(t('errors.generic'));
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('log.title')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('log.amountLabel')}</Text>
          <AmountInput
            valueMinor={amountMinor}
            onChangeMinor={(fils) => {
              setAmountMinor(fils);
              if (error) setError(null);
            }}
            locale={locale}
            autoFocus
            placeholder={t('log.amountPlaceholder')}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('log.categoryLabel')}</Text>
          <CategoryPicker value={category} onChange={setCategory} locale={locale} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('log.noteLabel')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('log.notePlaceholder')}
            placeholderTextColor={theme.colors.textSecondary}
            style={styles.note}
            accessibilityLabel={t('log.noteLabel')}
            returnKeyType="done"
            maxLength={140}
          />
        </View>

        <View style={styles.actions}>
          <Button label={t('log.save')} onPress={handleSave} disabled={saving} />
          <Button
            label={t('capture.title')}
            onPress={() => router.push(ROUTES.capture)}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  title: {
    fontSize: theme.typography.title,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  field: {
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.body,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  error: {
    fontSize: theme.typography.caption,
    color: theme.colors.survival,
  },
  note: {
    minHeight: 52,
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    // Logical alignment so the note reads correctly in RTL (Arabic) too.
    textAlign: 'auto',
  },
  actions: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});
