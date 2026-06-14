/**
 * Render smoke tests for primitives that don't require i18n/native module wiring.
 * Uses react-test-renderer (present via react 19) — no new dependency.
 *
 * The required logic test lives in parseAmount.test.ts; these guard against the most
 * basic render/colour-by-state regressions in BigNumber and Button.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import type { Money } from '@/contracts';
import { theme } from '@/theme';

import { BigNumber } from '../BigNumber';
import { Button } from '../Button';

/** Minimal fake Money — only `.format` is exercised by BigNumber. */
function fakeMoney(display: string): Money {
  return {
    fils: 0,
    add: () => fakeMoney(display),
    subtract: () => fakeMoney(display),
    multiply: () => fakeMoney(display),
    divide: () => fakeMoney(display),
    compare: () => 0,
    isNegative: () => false,
    isZero: () => false,
    format: () => display,
  } as Money;
}

function findText(node: ReactTestRenderer): string[] {
  return node.root.findAllByType(Text).map((t) => {
    const children = t.props.children;
    return Array.isArray(children) ? children.join('') : String(children);
  });
}

describe('BigNumber', () => {
  it('renders the formatted money string and the caption', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <BigNumber value={fakeMoney('1,250 AED')} locale="en" state="safe" caption="Safe to spend" />,
      );
    });
    const texts = findText(tree);
    expect(texts).toContain('1,250 AED');
    expect(texts).toContain('Safe to spend');
  });

  it('colours the number with the safe accent in safe state', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<BigNumber value={fakeMoney('100')} locale="en" state="safe" />);
    });
    const numberNode = tree.root.findAllByType(Text)[0];
    const flat = flattenStyle(numberNode.props.style);
    expect(flat.color).toBe(theme.colors.safe);
  });

  it('colours the number with the survival accent in survival state', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<BigNumber value={fakeMoney('5')} locale="en" state="survival" />);
    });
    const numberNode = tree.root.findAllByType(Text)[0];
    const flat = flattenStyle(numberNode.props.style);
    expect(flat.color).toBe(theme.colors.survival);
  });

  it('renders no caption node when caption is omitted', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<BigNumber value={fakeMoney('100')} locale="en" state="safe" />);
    });
    // Only the number Text should be present.
    expect(tree.root.findAllByType(Text)).toHaveLength(1);
  });
});

describe('Button', () => {
  it('renders the provided (already-localized) label', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Button label="Save" onPress={() => {}} />);
    });
    expect(findText(tree)).toContain('Save');
  });

  it('fires onPress when pressed and not disabled', () => {
    const onPress = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Button label="Save" onPress={onPress} />);
    });
    act(() => {
      tree.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports disabled state for accessibility', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Button label="Save" onPress={() => {}} disabled />);
    });
    const pressable = tree.root.findByProps({ accessibilityRole: 'button' });
    expect(pressable.props.accessibilityState).toEqual({ disabled: true });
  });

  it('uses the survival accent for the danger variant', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Button label="Remove" onPress={() => {}} variant="danger" />);
    });
    const pressable = tree.root.findByProps({ accessibilityRole: 'button' });
    // style is a function (pressable); call it with unpressed state.
    const flat = flattenStyle(pressable.props.style({ pressed: false }));
    expect(flat.backgroundColor).toBe(theme.colors.survival);
  });
});

/** Flatten an RN style prop (object | array | nested arrays) into one object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>((acc, s) => ({ ...acc, ...flattenStyle(s) }), {});
  }
  return style as Record<string, unknown>;
}
