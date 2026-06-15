/**
 * Paste-intake + candidate-confirm screen (Capture C4, Bucket 2 feed 1).
 *
 * The cross-platform, no-native half of share-sheet/paste capture: the user pastes a bank SMS or
 * payment alert; we run the PURE parser (`@/capture`) on-device and, if it reads a transaction,
 * propose it as an editable CANDIDATE. Nothing is saved until the user taps Confirm.
 *
 * Three phases:
 *  - `paste`   — multiline field + Read. Runs `parseTransaction(raw)`.
 *  - `confirm` — editable card (amount, category, merchant note) seeded from the candidate;
 *                the parsed date, if any, is shown read-only. Confirm persists via the repository.
 *  - `failed`  — a quiet "couldn't read that" message + a route to manual logging.
 *
 * Rules honoured here:
 *  - R8 confirm-don't-assume: a parsed result is only ever shown for confirm/edit, NEVER
 *    auto-saved. The raw text stays on this screen (in component state) — it is never uploaded
 *    and is not carried into the stored expense (only the structured fields are).
 *  - R3: money is integer fils throughout (`AmountInput` is controlled in fils; no float math).
 *  - R4: every visible string comes from i18n (`capture.*` / `errors.*`); layout uses logical
 *    column flex + symmetric padding, never left/right. `textAlign: 'auto'` keeps text correct in RTL.
 *  - R6: informational only — no advice copy, no money movement.
 *
 * Data access is repository-only (PATTERNS) — no raw queries in the screen.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseTransaction } from '@/capture';
import { AmountInput, Button, CategoryPicker, ScreenContainer } from '@/components';
import { ROUTES, type ExpenseCategory, type ParsedTransaction } from '@/contracts';
import { ensureSchema, repository } from '@/db';
import { theme } from '@/theme';

import {
  candidateToExpenseInput,
  defaultNoteFromCandidate,
  DEFAULT_CATEGORY,
  isAmountValid,
} from './captureForm';

type Phase =
  | { kind: 'paste' }
  | { kind: 'confirm'; candidate: ParsedTransaction }
  | { kind: 'failed' };

export default function Capture() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  // Phase 1 — the pasted raw text (stays on-device; never uploaded, R8).
  const [raw, setRaw] = useState<string>('');
  const [phase, setPhase] = useState<Phase>({ kind: 'paste' });

  // Phase 2 — editable confirm fields, seeded from the candidate when we enter `confirm`.
  const [amountMinor, setAmountMinor] = useState<number>(0);
  const [category, setCategory] = useState<ExpenseCategory>(DEFAULT_CATEGORY);
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  /** Run the pure parser on the pasted text. Confirm on hit; show the manual fallback on a miss. */
  const handleRead = () => {
    const result = parseTransaction(raw);
    if (result.ok) {
      const candidate = result.value;
      // Seed the editable card from the candidate (R8: proposed, not saved).
      setAmountMinor(candidate.amountMinor);
      setCategory(candidate.category ?? DEFAULT_CATEGORY);
      setNote(defaultNoteFromCandidate(candidate));
      setError(null);
      setPhase({ kind: 'confirm', candidate });
    } else {
      setPhase({ kind: 'failed' });
    }
  };

  /** Persist the confirmed candidate as a `source: 'captured'` expense, then return. */
  const handleConfirm = async () => {
    if (phase.kind !== 'confirm') return;
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
      await repository.addExpense(
        candidateToExpenseInput(phase.candidate, { amountMinor, category, note }),
      );
      router.back();
    } catch {
      // Persisting failed — keep the user on the card with their input intact.
      setError(t('errors.generic'));
      setSaving(false);
    }
  };

  /** Couldn't read it — hand off to the frictionless manual log (replace, so Back doesn't return here). */
  const goToManual = () => {
    router.replace(ROUTES.log);
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('capture.title')}</Text>

        {phase.kind === 'paste' ? (
          <>
            <Text style={styles.subtitle}>{t('capture.subtitle')}</Text>
            <TextInput
              value={raw}
              onChangeText={setRaw}
              placeholder={t('capture.pastePlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
              style={styles.paste}
              accessibilityLabel={t('capture.pastePlaceholder')}
              multiline
              textAlignVertical="top"
              autoCorrect={false}
              autoCapitalize="none"
            />
            <View style={styles.actions}>
              <Button
                label={t('capture.read')}
                onPress={handleRead}
                disabled={raw.trim().length === 0}
              />
            </View>
          </>
        ) : null}

        {phase.kind === 'confirm' ? (
          <>
            <Text style={styles.review}>{t('capture.review')}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>{t('capture.amountLabel')}</Text>
              <AmountInput
                valueMinor={amountMinor}
                onChangeMinor={(fils) => {
                  setAmountMinor(fils);
                  if (error) setError(null);
                }}
                locale={locale}
                placeholder={t('capture.amountLabel')}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('capture.categoryLabel')}</Text>
              <CategoryPicker value={category} onChange={setCategory} locale={locale} />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('capture.merchant')}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('capture.merchantPlaceholder')}
                placeholderTextColor={theme.colors.textSecondary}
                style={styles.note}
                accessibilityLabel={t('capture.merchant')}
                returnKeyType="done"
                maxLength={140}
              />
            </View>

            {phase.candidate.date ? (
              <View style={styles.field}>
                <Text style={styles.label}>{t('capture.date')}</Text>
                <Text style={styles.dateValue}>{phase.candidate.date}</Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button label={t('capture.confirm')} onPress={handleConfirm} disabled={saving} />
            </View>
          </>
        ) : null}

        {phase.kind === 'failed' ? (
          <>
            <Text style={styles.failed}>{t('capture.couldntRead')}</Text>
            <View style={styles.actions}>
              <Button label={t('capture.enterManually')} onPress={goToManual} />
            </View>
          </>
        ) : null}
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
  subtitle: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    // Logical alignment so copy reads correctly in RTL (Arabic) too.
    textAlign: 'auto',
  },
  review: {
    fontSize: theme.typography.body,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  paste: {
    minHeight: 140,
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    textAlign: 'auto',
  },
  field: {
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: theme.typography.body,
    fontWeight: '600',
    color: theme.colors.textSecondary,
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
    textAlign: 'auto',
  },
  dateValue: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'auto',
  },
  error: {
    fontSize: theme.typography.caption,
    color: theme.colors.survival,
  },
  failed: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    textAlign: 'auto',
  },
  actions: {
    marginTop: theme.spacing.sm,
  },
});
