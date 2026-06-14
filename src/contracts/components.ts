/**
 * CONTRACT — shared UI primitive props. Frozen in Phase 1. Implemented by DESIGN in `src/components`.
 * Screen owners consume these primitives and must not redefine them.
 * RTL: primitives use logical start/end, never left/right (R4 / ANTIPATTERNS).
 */
import type { ReactNode } from 'react';

import type { ExpenseCategory } from './entities';
import type { Money } from './money';
import type { BudgetState } from './theme';

export interface ScreenContainerProps {
  children: ReactNode;
  /** Optional state tint; Home passes safe/survival. Default 'safe'. */
  state?: BudgetState;
  /** Adds default screen padding. Default true. */
  padded?: boolean;
}

export interface BigNumberProps {
  /** The value shown huge (e.g. daily allowance). */
  value: Money;
  locale: string;
  state: BudgetState;
  /** Already-localized small label shown under the number. */
  caption?: string;
}

export interface AmountInputProps {
  /** Controlled value in fils. */
  valueMinor: number;
  onChangeMinor: (fils: number) => void;
  locale: string;
  autoFocus?: boolean;
  /** Already-localized placeholder. */
  placeholder?: string;
}

export interface CategoryPickerProps {
  value: ExpenseCategory;
  onChange: (category: ExpenseCategory) => void;
  locale: string;
}

export interface ButtonProps {
  /** Already-localized label. */
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}
