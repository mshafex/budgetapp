/**
 * Onboarding step 1 — monthly salary (ONBOARDING).
 *
 * Captures the monthly salary in integer fils via the shared `AmountInput` (controlled in
 * fils, R3), validates it is > 0, writes it to the onboarding draft singleton, and advances
 * to the fixed-costs step. All copy comes from i18n (`onboarding.salary.*`, `errors.*`,
 * `common.next`) — no hardcoded user-facing strings (R4). Layout is logical/symmetric (RTL).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { AmountInput, Button, ScreenContainer } from '@/components';
import { ROUTES } from '@/contracts';
import { theme } from '@/theme';

import { onboardingStore, validateSalaryMinor } from './state';
import { useOnboardingDraft } from './useOnboardingDraft';

export default function OnboardingSalary() {
  const { t, i18n } = useTranslation();
  const draft = useOnboardingDraft();
  const [showError, setShowError] = useState(false);

  const error = validateSalaryMinor(draft.salaryMinor);

  const handleNext = () => {
    if (error) {
      setShowError(true);
      return;
    }
    router.push(ROUTES.onboardingFixed);
  };

  return (
    <ScreenContainer>
      <View style={styles.body}>
        <Text style={styles.title}>{t('onboarding.salary.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.salary.subtitle')}</Text>

        <View style={styles.field}>
          <AmountInput
            valueMinor={draft.salaryMinor}
            onChangeMinor={(fils) => {
              onboardingStore.setSalaryMinor(fils);
              if (showError) setShowError(false);
            }}
            locale={i18n.language}
            autoFocus
            placeholder={t('onboarding.salary.placeholder')}
          />
          <Text style={styles.hint}>{t('onboarding.salary.hint')}</Text>
          {showError && error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {t(error)}
            </Text>
          ) : null}
        </View>
      </View>

      <Button label={t('common.next')} onPress={handleNext} />
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
  hint: {
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  error: {
    fontSize: theme.typography.caption,
    color: theme.colors.survival,
  },
});
