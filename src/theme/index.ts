/**
 * Theme token VALUES (DESIGN). Conforms to the frozen `Theme` contract (`@/contracts/theme`).
 *
 * Tone (RULES / ANTIPATTERNS): serious, numbers-first — NOT cheerful, NOT gamified.
 * The two semantic states must read in < 0.5s:
 *   - `safe`     → calm, cool teal. "You're OK." Quiet, not celebratory.
 *   - `survival` → urgent, warm amber-red. "Tighten up." Reads as alarm at a glance.
 * The hues sit on opposite sides of the wheel (cool ~180° vs warm ~18°), so the two
 * states differ in HUE and WARMTH, not just brightness — distinguishable even for the
 * colour-vision-impaired and under a quick glance.
 *
 * One cohesive dark palette: a near-black slate ground lets The Number dominate Home.
 */
import type { Theme } from '@/contracts/theme';

const colors: Theme['colors'] = {
  // Deep, neutral slate ground. Serious; keeps focus on the number.
  background: '#0E1116',
  // Slightly lifted card surface, still dark.
  surface: '#171C24',
  // High-contrast primary text.
  textPrimary: '#F2F5F8',
  // Muted secondary text for captions / labels.
  textSecondary: '#9AA4B2',
  // Hairline dividers and input borders.
  border: '#2A313C',

  // SAFE — calm cool teal. Distinct hue from survival; not a "success green".
  safe: '#3FB6A8',
  // Foreground on a safe-filled surface (dark text on the teal fill).
  safeOn: '#06201C',

  // SURVIVAL — urgent warm amber-red. Alarms at a glance; clearly not "safe".
  survival: '#E5544B',
  // Foreground on a survival-filled surface (near-white on the red fill).
  survivalOn: '#FFF4F2',
};

const spacing: Theme['spacing'] = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
};

const radii: Theme['radii'] = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

const typography: Theme['typography'] = {
  // The Number — the single biggest element on Home.
  display: 72,
  title: 22,
  body: 16,
  caption: 13,
};

export const theme: Theme = {
  colors,
  spacing,
  radii,
  typography,
};

export default theme;
