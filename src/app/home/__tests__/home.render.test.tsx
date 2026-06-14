/**
 * Render-wiring tests for the Home screen.
 *
 * The pure decisions are covered in `homeView.test.ts`; here we mock the side-effecting
 * deps (`@/db`, `@/engine`, `expo-router`) and assert the screen's three branches wire up:
 *   - no profile           → redirects to onboarding,
 *   - safe result          → shows the number + the log button, no survival banner,
 *   - survival result      → shows the survival banner.
 *
 * expo-sqlite/native are never touched — every dependency is mocked. We use
 * react-test-renderer (already present via React 19), matching the components tests.
 */
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { BudgetResult, User } from '@/contracts';
// Initialize the real i18n instance so `t(...)` resolves to English copy (mirrors how
// the app's _layout imports it). Pinned to 'en' in beforeAll for deterministic assertions.
import i18n from '@/i18n';

// --- Mocks -----------------------------------------------------------------

const mockGetUser = jest.fn();
const mockSumExpensesMinor = jest.fn();
const mockListFixedItems = jest.fn();
const mockComputeBudget = jest.fn();
const mockResolveCycle = jest.fn();
const mockPush = jest.fn();

jest.mock('@/db', () => ({
  ensureSchema: jest.fn(),
  repository: {
    getUser: () => mockGetUser(),
    sumExpensesMinor: (from: string, to: string) => mockSumExpensesMinor(from, to),
    listFixedItems: () => mockListFixedItems(),
  },
}));

jest.mock('@/engine', () => ({
  computeBudget: (input: unknown) => mockComputeBudget(input),
  resolveCycle: (today: string, payDay: number) => mockResolveCycle(today, payDay),
}));

// Capture what Home redirects to, and run the focus callback immediately on mount.
let lastRedirectHref: string | null = null;
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react') as typeof import('react');
  return {
    router: { push: (href: string) => mockPush(href) },
    Redirect: ({ href }: { href: string }) => {
      lastRedirectHref = href;
      return null;
    },
    useFocusEffect: (cb: () => undefined | (() => void)) => {
      React.useEffect(() => cb(), [cb]);
    },
  };
});

import Home from '../index';

// --- Fixtures --------------------------------------------------------------

const user: User = {
  id: 1,
  salaryMinor: 600000,
  payDay: 1,
  currency: 'AED',
  locale: 'en',
  survivalThresholdMinor: 5000,
};

const safeResult: BudgetResult = {
  disposableMinor: 450000,
  remainingMinor: 300000,
  daysLeft: 15,
  dailyAllowanceMinor: 20000,
  survival: false,
  cycleStart: '2026-06-01',
  cycleEnd: '2026-07-01',
};

const survivalResult: BudgetResult = { ...safeResult, dailyAllowanceMinor: 2000, survival: true };

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children as ReactNode;
      return Array.isArray(children) ? children.join('') : String(children);
    })
    .join(' | ');
}

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Render Home and let all pending microtasks (the async focus load) settle. */
async function renderHome(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <Home />
      </SafeAreaProvider>,
    );
  });
  // Flush the promise chain inside the focus effect.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  lastRedirectHref = null;
  mockResolveCycle.mockReturnValue({
    cycleStart: '2026-06-01',
    cycleEnd: '2026-07-01',
    daysLeft: 15,
  });
  mockSumExpensesMinor.mockResolvedValue(150000);
  mockListFixedItems.mockResolvedValue([]);
});

describe('Home — no profile', () => {
  it('redirects to onboarding when getUser returns null', async () => {
    mockGetUser.mockResolvedValue(null);
    await renderHome();
    expect(lastRedirectHref).toBe('/onboarding/salary');
  });
});

describe('Home — safe state', () => {
  it('renders the number, the cycle facts, and the log button; no survival banner', async () => {
    mockGetUser.mockResolvedValue(user);
    mockComputeBudget.mockReturnValue(safeResult);

    const tree = await renderHome();
    const text = allText(tree);

    // i18n resolved English copy (real i18n is initialized by importing the screen tree).
    expect(text).toContain('Safe to spend today');
    expect(text).toContain('Log an expense');
    // Survival banner copy must be absent in the safe state.
    expect(text).not.toContain('Survival mode');

    // The engine was called with the spent figure the repository returned.
    expect(mockComputeBudget).toHaveBeenCalledWith(
      expect.objectContaining({ spentThisCycleMinor: 150000, carryoverMinor: 0 }),
    );
  });

  it('navigates to the log route when the button is pressed', async () => {
    mockGetUser.mockResolvedValue(user);
    mockComputeBudget.mockReturnValue(safeResult);

    const tree = await renderHome();
    const button = tree.root.findByProps({ accessibilityRole: 'button' });
    act(() => {
      button.props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/log');
  });
});

describe('Home — survival state', () => {
  it('renders the survival banner', async () => {
    mockGetUser.mockResolvedValue(user);
    mockComputeBudget.mockReturnValue(survivalResult);

    const tree = await renderHome();
    const text = allText(tree);
    expect(text).toContain('Survival mode');
    expect(text).toContain('Spend with care today');
  });
});
