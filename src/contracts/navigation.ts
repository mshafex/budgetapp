/**
 * CONTRACT — route map. Frozen in Phase 1. Expo Router file-based routes.
 *
 * Ownership:
 *  - ONBOARDING → src/app/onboarding/*
 *  - HOME       → src/app/home/*
 *  - LOGGING    → src/app/log/*
 *  - LEAD       → src/app/_layout.tsx, src/app/index.tsx (initial routing decision)
 */
export const ROUTES = {
  index: '/',
  onboarding: '/onboarding',
  onboardingSalary: '/onboarding/salary',
  onboardingFixed: '/onboarding/fixed',
  onboardingPayday: '/onboarding/payday',
  home: '/home',
  log: '/log',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];
