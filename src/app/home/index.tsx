/**
 * HOME — "The Number". The entire product is this one screen answering
 * "how much can I safely spend today?" — shown huge, coloured by state.
 *
 * Responsibilities (the side-effecting half; pure decisions live in `homeView.ts`):
 *  1. On focus, read the profile + this cycle's spend from the repository and compute the
 *     budget via the pure engine (we pass `today` — the engine has no ambient clock).
 *  2. Map the result to a view-model (`toHomeView`) and render it.
 *
 * Refreshes on focus (via `useFocusEffect`) so returning from logging an expense
 * recomputes the number immediately.
 *
 * Rules honoured here:
 *  - R3 money: never raw fils math — values come from the engine/Money via the view-model.
 *  - R4 i18n + RTL: all copy via `t(...)`; layout is centred / symmetric (no left/right).
 *  - R6 PFM tone: facts and figures only — no advice, no "you should…".
 */
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BigNumber, Button, ScreenContainer } from '@/components';
import { ROUTES, type User } from '@/contracts';
import { ensureSchema, repository } from '@/db';
import { computeBudget, resolveCycle } from '@/engine';
import { theme } from '@/theme';

import { type HomeView, toHomeView } from './homeView';

/** UTC 'YYYY-MM-DD' for "today" — the engine expects an injected ISO date string. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type LoadState =
  | { status: 'loading' }
  | { status: 'no-user' }
  | { status: 'ready'; view: HomeView };

export default function Home() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        // Defensive idempotent bootstrap; the LEAD shell also calls this at app init.
        try {
          ensureSchema();
        } catch {
          // ignore — schema is idempotent; surfaced elsewhere if the platform is unsupported
        }

        const user: User | null = await repository.getUser().catch(() => null);
        if (!active) return;
        if (!user) {
          setLoad({ status: 'no-user' });
          return;
        }

        const today = todayIso();
        const { cycleStart, cycleEnd } = resolveCycle(today, user.payDay);
        // Two independent reads — run them together rather than serially.
        const [spentThisCycleMinor, fixedItems] = await Promise.all([
          repository.sumExpensesMinor(cycleStart, cycleEnd),
          repository.listFixedItems(),
        ]);
        if (!active) return;

        const result = computeBudget({
          salaryMinor: user.salaryMinor,
          fixedItems,
          spentThisCycleMinor,
          survivalThresholdMinor: user.survivalThresholdMinor,
          payDay: user.payDay,
          today,
          carryoverMinor: 0,
        });

        setLoad({
          status: 'ready',
          view: toHomeView(result, user, spentThisCycleMinor, locale),
        });
      })();

      return () => {
        active = false;
      };
    }, [locale]),
  );

  if (load.status === 'no-user') {
    // Defensive: Home is only routed to once a profile exists, but if it doesn't, send
    // the user to onboarding rather than rendering an empty/zeroed number.
    return <Redirect href={ROUTES.onboardingSalary} />;
  }

  if (load.status === 'loading') {
    return (
      <ScreenContainer state="safe">
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.safe} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </ScreenContainer>
    );
  }

  const { view } = load;
  const goLog = () => router.push(ROUTES.log);

  return (
    <ScreenContainer state={view.state}>
      <View style={styles.body}>
        {/* The focal element — huge, coloured by state, read in < 0.5s. */}
        <View style={styles.numberBlock}>
          <BigNumber
            value={view.dailyAllowance}
            locale={locale}
            state={view.state}
            caption={t(view.caption.key, view.caption.params)}
          />
        </View>

        {/* Survival banner — only when the daily limit is below the user's threshold. */}
        {view.banner ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Text style={styles.bannerTitle}>{t(view.banner.title.key)}</Text>
            <Text style={styles.bannerBody}>{t(view.banner.body.key)}</Text>
            <View style={styles.bannerRow}>
              <Text style={styles.bannerLabel}>{t(view.banner.limitLabel.key)}</Text>
              <Text style={styles.bannerValue}>{view.banner.limitValue}</Text>
            </View>
            <View style={styles.bannerRow}>
              <Text style={styles.bannerLabel}>{t(view.banner.thresholdLabel.key)}</Text>
              <Text style={styles.bannerValue}>{view.banner.thresholdValue}</Text>
            </View>
          </View>
        ) : null}

        {/* Secondary facts — quiet, factual, no advice. */}
        <View style={styles.facts}>
          <Text style={styles.factLine}>{t(view.daysLeft.key, view.daysLeft.params)}</Text>

          <View style={styles.factRow}>
            <Text style={styles.factLabel}>{t(view.remaining.label.key)}</Text>
            <Text style={styles.factValue}>{view.remaining.value}</Text>
          </View>

          <View style={styles.factRow}>
            <Text style={styles.factLabel}>{t(view.spent.label.key)}</Text>
            <Text style={styles.factValue}>{view.spent.value}</Text>
          </View>

          <Text style={styles.cycleRange}>{t(view.cycleRange.key, view.cycleRange.params)}</Text>
        </View>
      </View>

      <Button label={t('home.logExpense')} onPress={goLog} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  // Body grows to push the number toward the centre and the button to the bottom.
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  numberBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  facts: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  factLine: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  // Logical start/end keep the label↔value split correct under RTL.
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  // No textAlign: the flex row positions label at the start edge and value at the end
  // edge, and RN flips row direction under RTL — so this stays correct without left/right.
  factLabel: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
  },
  factValue: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  cycleRange: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  banner: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.survival,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  // Block text: the default alignment already follows the writing direction (LTR→left,
  // RTL→right), which is what we want — so no explicit textAlign (RN has no 'start'/'end').
  bannerTitle: {
    fontSize: theme.typography.title,
    fontWeight: '800',
    color: theme.colors.survival,
  },
  bannerBody: {
    fontSize: theme.typography.body,
    color: theme.colors.textPrimary,
  },
  bannerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  bannerLabel: {
    fontSize: theme.typography.body,
    color: theme.colors.textSecondary,
  },
  bannerValue: {
    fontSize: theme.typography.body,
    fontWeight: '700',
    color: theme.colors.survival,
    fontVariant: ['tabular-nums'],
  },
});
