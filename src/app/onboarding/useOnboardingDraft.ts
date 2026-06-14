/**
 * React binding for the onboarding draft singleton (ONBOARDING).
 *
 * Kept separate from `state.ts` so that module stays React-free and unit-testable without
 * the React runtime. Screens call `useOnboardingDraft()` to read the live draft and
 * re-render when any step mutates it.
 */
import { useSyncExternalStore } from 'react';

import { onboardingStore, type OnboardingDraft } from './state';

export function useOnboardingDraft(): OnboardingDraft {
  return useSyncExternalStore(
    onboardingStore.subscribe,
    onboardingStore.getDraft,
    onboardingStore.getDraft,
  );
}
