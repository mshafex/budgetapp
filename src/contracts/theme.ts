/**
 * CONTRACT — theme tokens. Frozen in Phase 1. Values provided by DESIGN in `src/theme`.
 *
 * Tone (RULES): serious, numbers-first — not cheerful, not gamified.
 * Two semantic states must be distinguishable in < 0.5s: `safe` vs `survival`.
 */

export type BudgetState = 'safe' | 'survival';

export interface ThemeColors {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  /** "You're OK" accent — the number in safe state. */
  safe: string;
  /** Foreground on a `safe`-filled surface. */
  safeOn: string;
  /** "Tighten up" accent — the number + banner in survival state. */
  survival: string;
  /** Foreground on a `survival`-filled surface. */
  survivalOn: string;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface ThemeRadii {
  sm: number;
  md: number;
  lg: number;
  pill: number;
}

export interface ThemeTypography {
  /** The Number — the single biggest element on Home. */
  display: number;
  title: number;
  body: number;
  caption: number;
}

export interface Theme {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  radii: ThemeRadii;
  typography: ThemeTypography;
}
