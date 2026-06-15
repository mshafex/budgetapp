/**
 * Render-wiring tests for the paste-intake screen (Capture C4).
 *
 * The pure mapping is covered in `captureForm.test.ts`; here we mock the side-effecting deps
 * (`@/db`, `@/capture`, `expo-router`) and assert the screen's three branches wire up:
 *   - parser hit  → shows the editable confirm card; Confirm persists a `source: 'captured'`
 *                   expense and returns (R8: only AFTER an explicit confirm — never on Read),
 *   - parser miss → shows the "couldn't read" message; the button routes to manual logging,
 *   - Read is disabled until something is pasted.
 *
 * expo-sqlite/native is never touched — every dependency is mocked. We use react-test-renderer
 * (present via React 19), matching the other screen tests.
 */
import { Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ExpenseInput, ParseResult } from '@/contracts';
// Initialize the real i18n instance so `t(...)` resolves to English copy. Pinned to 'en' below.
import i18n from '@/i18n';

// --- Mocks -----------------------------------------------------------------

const mockAddExpense = jest.fn<Promise<unknown>, [ExpenseInput]>();
const mockParse = jest.fn<ParseResult, [string, string?]>();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/db', () => ({
  ensureSchema: jest.fn(),
  repository: {
    addExpense: (input: ExpenseInput) => mockAddExpense(input),
  },
}));

jest.mock('@/capture', () => ({
  parseTransaction: (raw: string, hint?: string) => mockParse(raw, hint),
}));

jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
    replace: (href: string) => mockReplace(href),
  },
}));

import Capture from '../index';

// --- Helpers ---------------------------------------------------------------

function allText(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join('') : String(children);
    })
    .join(' | ');
}

/** The Read/Confirm/Enter-manually buttons render their label via an accessibilityRole="button". */
function pressButton(tree: ReactTestRenderer, label: string): void {
  const button = tree.root
    .findAll(
      (node) =>
        node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label,
    )
    .at(0);
  if (!button) throw new Error(`button not found: ${label}`);
  act(() => {
    button.props.onPress();
  });
}

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderCapture(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <Capture />
      </SafeAreaProvider>,
    );
  });
  return tree;
}

/** Type into the multiline paste field (the first TextInput on the paste screen). */
function paste(tree: ReactTestRenderer, value: string): void {
  const input = tree.root.findAllByType(TextInput).at(0);
  if (!input) throw new Error('paste field not found');
  act(() => {
    input.props.onChangeText(value);
  });
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAddExpense.mockResolvedValue({ id: 1 });
});

describe('Capture — paste phase', () => {
  it('starts on the paste screen with the prompt and no confirm card', () => {
    const tree = renderCapture();
    const text = allText(tree);
    expect(text).toContain('Read a bank alert');
    expect(text).toContain('Paste a bank SMS');
    expect(text).not.toContain('Check these details');
  });

  it('does not parse until the user taps Read (R8: never on paste)', () => {
    const tree = renderCapture();
    paste(tree, 'AED 42.50 at Carrefour');
    expect(mockParse).not.toHaveBeenCalled();
  });
});

describe('Capture — parser hit → confirm → save', () => {
  beforeEach(() => {
    mockParse.mockReturnValue({
      ok: true,
      value: {
        amountMinor: 4250,
        merchant: 'Carrefour',
        date: '2026-06-14',
        category: 'shopping',
        raw: 'AED 42.50 at Carrefour on 14/06/2026',
        sourceKey: 'fab',
      },
    });
  });

  it('shows the editable confirm card seeded from the candidate', () => {
    const tree = renderCapture();
    paste(tree, 'AED 42.50 at Carrefour on 14/06/2026');
    pressButton(tree, 'Read');

    const text = allText(tree);
    expect(text).toContain('Check these details');
    // Parsed date is shown read-only.
    expect(text).toContain('2026-06-14');
    // The merchant seeds the editable note field.
    const noteField = tree.root
      .findAllByType(TextInput)
      .find((n) => n.props.value === 'Carrefour');
    expect(noteField).toBeTruthy();
  });

  it('persists a source:"captured" expense on Confirm, then returns (only after confirm)', async () => {
    const tree = renderCapture();
    paste(tree, 'AED 42.50 at Carrefour on 14/06/2026');
    pressButton(tree, 'Read');

    // Nothing saved merely by reading (R8).
    expect(mockAddExpense).not.toHaveBeenCalled();

    pressButton(tree, 'Confirm expense');
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockAddExpense).toHaveBeenCalledTimes(1);
    expect(mockAddExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 4250,
        category: 'shopping',
        note: 'Carrefour',
        source: 'captured',
      }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe('Capture — parser miss', () => {
  it('shows the "couldn\'t read" message and routes to manual logging', () => {
    mockParse.mockReturnValue({ ok: false, reason: 'no-template-matched' });

    const tree = renderCapture();
    paste(tree, 'not a transaction');
    pressButton(tree, 'Read');

    const text = allText(tree);
    expect(text).toContain("Couldn't read that message");
    expect(mockAddExpense).not.toHaveBeenCalled();

    pressButton(tree, 'Enter it manually');
    expect(mockReplace).toHaveBeenCalledWith('/log');
  });
});
