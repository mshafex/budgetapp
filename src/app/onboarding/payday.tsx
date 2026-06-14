/**
 * Onboarding step 3 — pay day, then persist (ONBOARDING).
 *
 * Captures the day-of-month salary lands (1..31), validates the range, and on finish writes
 * the whole onboarding draft to the local DB (single source of truth, R2/R5):
 *   ensureSchema() → repository.saveUser(...) → repository.addFixedItem(...) per item,
 * then replaces the stack with Home.
 *
 * The pay day is a small bounded integer (not money), so it uses a plain numeric TextInput
 * and `parsePayDay`/`validatePayDay` rather than the money `AmountInput`. All copy is i18n
 * (`onboarding.payday.*`, `common.done`, `errors.*`) — no hardcoded strings (R4). Layout is
 * logical/symmetric (RTL-safe).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, ScreenContainer } from '@/components';
import type { AppLocale } from '@/contracts';
import { ROUTES } from '@/contracts';
import { ensureSchema, repository } from '@/db';
import { theme } from '@/theme';

import {
  draftFixedItemsToInputs,
  draftToUserInput,
  onboardingStore,
  parsePayDay,
  validatePayDay,
} from './state';
import { useOnboardingDraft } from './useOnboardingDraft';

export default function OnboardingPayday() {
  const { t, i18n } = useTranslation();
  const draft = useOnboardingDraft();
  const [text, setText] = useState(draft.payDay === null ? '' : String(draft.payDay));
  const [showError, setShowError] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const error = validatePayDay(draft.payDay);

  const handleChange = (next: string) => {
    setText(next);
    onboardingStore.setPayDay(parsePayDay(next));
    if (showError) setShowError(false);
    if (saveFailed) setSaveFailed(false);
  };

  const handleFinish = async () => {
    if (saving) return;
    if (error) {
      setShowError(true);
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    try {
      ensureSchema();
      const locale: AppLocale = i18n.language === 'ar' ? 'ar' : 'en';
      await repository.saveUser(draftToUserInput(draft, locale));
      for (const item of draftFixedItemsToInputs(draft)) {
        await repository.addFixedItem(item);
      }
      onboardingStore.reset();
      router.replace(ROUTES.home);
    } catch {
      // Persisting failed (e.g. unsupported platform). Surface a generic, non-advisory
      // message and let the user retry rather than navigating to a half-set-up Home.
      setSaveFailed(true);
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.body}>
        <Text style={styles.title}>{t('onboarding.payday.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.payday.subtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.dayLabel}>{t('onboarding.payday.dayLabel')}</Text>
          <TextInput
            value={text}
            onChangeText={handleChange}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            autoFocus
            style={styles.input}
            textAlign="center"
            accessibilityLabel={t('onboarding.payday.dayLabel')}
          />
          <Text style={styles.hint}>{t('onboarding.payday.hint')}</Text>
          {showError && error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {t(error)}
            </Text>
          ) : null}
          {saveFailed ? (
            <Text style={styles.error} accessibilityRole="alert">
              {t('errors.generic')}
            </Text>
          ) : null}
        </View>
      </View>

      <Button
        label={t('common.done')}
        onPress={handleFinish}
        disabled={saving}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: theme.spacing.md,
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
  field: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  dayLabel: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
  },
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
  hint: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  error: {
    fontSize: theme.typography.caption,
    color: theme.colors.survival,
  },
});
