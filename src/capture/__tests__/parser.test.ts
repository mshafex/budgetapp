/**
 * Tests for the pure transaction parser (Bucket 2 core, R8 + R3).
 *
 * Focus:
 *  - Multiple realistic UAE bank/wallet formats parse correctly.
 *  - Amount → integer fils is EXACT: fils, thousands commas, no-decimal, large values (no drift).
 *  - Merchant + date extraction.
 *  - Non-transaction text (OTP, balance enquiry, marketing) → { ok: false }.
 *  - Arabic-script amount.
 *  - Parser never throws; sourceHint only biases order.
 *  - `amountMinor` is always an integer.
 */
import { parseTransaction } from '../parser';
import type { ParseResult, ParsedTransaction } from '@/contracts';

/** Narrow a result to its success value, failing the test with the miss reason otherwise. */
function expectOk(result: ParseResult): ParsedTransaction {
  if (!result.ok) {
    throw new Error(`expected ok, got miss: ${result.reason}`);
  }
  // Every successful parse must carry an integer fils amount (R3).
  expect(Number.isInteger(result.value.amountMinor)).toBe(true);
  return result.value;
}

describe('parseTransaction — bank/wallet formats', () => {
  it('parses an ADCB card purchase (fils, merchant, dd/mm/yyyy date)', () => {
    const raw =
      'ADCB: Your Card ending 1234 was used for AED 125.50 at CARREFOUR MALL OF EMIRATES on 03/06/2026.';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(12550);
    expect(v.sourceKey).toBe('adcb-card-purchase');
    expect(v.merchant).toBe('CARREFOUR MALL OF EMIRATES');
    expect(v.date).toBe('2026-06-03');
    expect(v.category).toBe('food'); // carrefour → food
    expect(v.raw).toBe(raw); // original text preserved verbatim (on-device only)
  });

  it('parses a FAB debit with thousands comma + .00 fraction (glued AEDamount)', () => {
    const raw =
      'FAB: AED1,250.00 debited from a/c ***6789 at NOON.COM on 12-06-2026. Avbl bal AED 3,400.00';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(125000); // 1,250.00 AED → 125000 fils (comma is grouping)
    expect(v.sourceKey).toBe('fab-account-debit');
    expect(v.merchant).toBe('NOON.COM');
    expect(v.date).toBe('2026-06-12');
  });

  it('parses an Emirates NBD purchase with "@ merchant" and dd-MMM-yyyy date', () => {
    const raw =
      'Emirates NBD: Purchase of AED 90.00 @ TALABAT on 03-Jun-2026 with Debit Card ending 4321.';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(9000);
    expect(v.sourceKey).toBe('enbd-card-purchase');
    expect(v.merchant).toBe('TALABAT');
    expect(v.date).toBe('2026-06-03');
    expect(v.category).toBe('food'); // talabat → food
  });

  it('parses a wallet payment ("You paid AED ... to ...")', () => {
    const raw = 'You paid AED 45.00 to CAREEM RIDE. Wallet balance AED 210.00.';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(4500);
    expect(v.sourceKey).toBe('wallet-payment');
    expect(v.merchant).toBe('CAREEM RIDE');
    expect(v.category).toBe('transport'); // careem → transport
    expect(v.date).toBeNull(); // no date in text
  });

  it('parses a generic debit alert with no decimals and dd-mm-yy date', () => {
    const raw = 'Your account was debited AED 12 at ADNOC STATION 123 on 1-6-26.';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(1200); // "AED 12" → 1200 fils (no fraction)
    expect(v.merchant).toBe('ADNOC STATION 123');
    expect(v.date).toBe('2026-06-01'); // yy → 20yy
    expect(v.category).toBe('transport'); // adnoc → transport
  });

  it('parses a generic alert where currency trails the amount ("90 AED")', () => {
    const raw = 'Purchase 90 AED at SPINNEYS approved.';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(9000);
    expect(v.sourceKey).toBe('generic-trailing-currency');
    expect(v.merchant).toBe('SPINNEYS');
    expect(v.category).toBe('food'); // spinneys → food
  });

  it('leaves merchant/date/category null when only an amount is present', () => {
    const raw = 'Card payment of AED 30.25 approved.';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(3025);
    expect(v.merchant).toBeNull();
    expect(v.date).toBeNull();
    expect(v.category).toBeNull();
  });
});

describe('parseTransaction — amount exactness (R3, no float drift)', () => {
  it('reads a fils-precision amount exactly', () => {
    const v = expectOk(parseTransaction('Card used for AED 0.99 at SHOP debited.'));
    expect(v.amountMinor).toBe(99);
  });

  it('reads a single-fraction-digit amount as tens of fils (no rounding up)', () => {
    // "AED 5.4" → 540 fils, never 545/550.
    const v = expectOk(parseTransaction('Spent AED 5.4 at CAFE.'));
    expect(v.amountMinor).toBe(540);
  });

  it('truncates a 3rd fraction digit rather than rounding up', () => {
    const v = expectOk(parseTransaction('Spent AED 5.999 at CAFE.'));
    expect(v.amountMinor).toBe(599); // truncated to 2 dp, not 600
  });

  it('treats a 3-digit trailing group as thousands, not fils', () => {
    // "AED 1,250" → 125000 fils (whole 1250 AED), NOT 1.250 → 125 fils.
    const v = expectOk(parseTransaction('Debited AED 1,250 at STORE.'));
    expect(v.amountMinor).toBe(125000);
  });

  it('handles a large multi-thousands value with fils exactly (no precision loss)', () => {
    // 1,234,567.89 AED → 123456789 fils. Float (×100) is risky; integer concat is exact.
    const v = expectOk(parseTransaction('Debited AED 1,234,567.89 at PROPERTY MANAGEMENT.'));
    expect(v.amountMinor).toBe(123456789);
    expect(Number.isSafeInteger(v.amountMinor)).toBe(true);
  });

  it('keeps a very large round value exact', () => {
    const v = expectOk(parseTransaction('Debited AED 9,000,000 at ESCROW.'));
    expect(v.amountMinor).toBe(900000000);
  });
});

describe('parseTransaction — Arabic-script alert', () => {
  it('parses an Arabic debit with Arabic-Indic digits and the د.إ mark', () => {
    // "تم خصم د.إ ٩٠٫٥٠ من بطاقتك لدى كارفور بتاريخ 03/06/2026"
    // خصم = debit, لدى = at, بتاريخ = on. Amount ٩٠٫٥٠ = 90.50.
    const raw = 'تم خصم د.إ ٩٠٫٥٠ من بطاقتك لدى كارفور بتاريخ 03/06/2026';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(9050);
    expect(v.sourceKey).toBe('arabic-card-debit');
    expect(v.merchant).toBe('كارفور');
    expect(v.date).toBe('2026-06-03');
  });

  it('parses an Arabic whole-dirham debit (Arabic-Indic, no fraction)', () => {
    const raw = 'تم خصم د.إ ٩٠ من بطاقتك لدى سبينس';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(9000);
    expect(v.merchant).toBe('سبينس');
    expect(v.date).toBeNull();
  });
});

describe('parseTransaction — non-transaction text rejected (R8: candidate, not noise)', () => {
  const misses: ReadonlyArray<[string, string]> = [
    ['OTP', 'Your one-time password (OTP) is 123456. Do not share it with anyone.'],
    ['balance enquiry', 'Your available balance is AED 3,400.00 as of 12-06-2026.'],
    ['credit/salary', 'Salary of AED 8,000.00 has been credited to your account.'],
    ['marketing', 'Enjoy 50% off this Eid! Shop now at noon.com and save big on AED deals.'],
    ['empty', ''],
    ['whitespace only', '   \n\t '],
    ['plain greeting', 'Welcome to ADCB mobile banking.'],
    ['no amount', 'Your card ending 1234 was used at CARREFOUR.'],
  ];

  it.each(misses)('rejects %s', (_label, raw) => {
    const result = parseTransaction(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('does not match a pure balance line even though it contains "AED <amount>"', () => {
    // No debit/purchase keyword → generic templates must NOT fire.
    expect(parseTransaction('Avbl bal AED 3,400.00').ok).toBe(false);
  });
});

describe('parseTransaction — sourceHint biases order only, never restricts', () => {
  it('still parses when the hint does not match any template', () => {
    const raw = 'Emirates NBD: Purchase of AED 90.00 @ TALABAT on 03-Jun-2026 with Debit Card ending 4321.';
    const v = expectOk(parseTransaction(raw, 'totally-unknown-bank'));
    expect(v.amountMinor).toBe(9000);
    expect(v.sourceKey).toBe('enbd-card-purchase'); // matched despite the bogus hint
  });

  it('biases a matching template first when multiple could match', () => {
    // This text matches both fab-account-debit AND the generic debit fallback. Without a hint the
    // specific FAB template (earlier in the list) wins anyway; assert the hint keeps that.
    const raw = 'FAB: AED1,250.00 debited from a/c ***6789 at NOON.COM on 12-06-2026.';
    const v = expectOk(parseTransaction(raw, 'fab'));
    expect(v.sourceKey).toBe('fab-account-debit');
  });

  it('treats an empty/whitespace hint as no hint', () => {
    const raw = 'You paid AED 45.00 to CAREEM RIDE.';
    const v = expectOk(parseTransaction(raw, '   '));
    expect(v.sourceKey).toBe('wallet-payment');
  });
});

describe('parseTransaction — robustness (never throws)', () => {
  it('never throws on malformed / hostile input and returns a clean miss', () => {
    const inputs: unknown[] = [
      undefined,
      null,
      12345,
      {},
      [],
      'AED', // currency but no number
      'AED .',
      '%%%% AED ,, debited at ;;;',
      'a'.repeat(50000), // very long string
    ];
    for (const input of inputs) {
      // Cast through unknown to exercise the runtime guard against bad callers.
      const result = parseTransaction(input as unknown as string);
      expect(result.ok).toBe(false);
    }
  });

  it('handles a multi-line notification (newlines normalized)', () => {
    const raw = 'ADCB: Your Card ending 1234 was used for\nAED 125.50 at CARREFOUR\non 03/06/2026.';
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(12550);
    expect(v.merchant).toBe('CARREFOUR');
    expect(v.raw).toBe(raw); // raw keeps the original newlines
  });

  it('stays fast (bounded) on a large hostile input — no super-linear backtracking', () => {
    // Worst case for the keyword-lookahead generic templates: a debit keyword present but NO
    // amount, in a very long string. The match-length cap must keep this well under a second.
    const huge = 'debited ' + 'a'.repeat(200000);
    const t0 = Date.now();
    const result = parseTransaction(huge);
    const elapsed = Date.now() - t0;
    expect(result.ok).toBe(false);
    expect(elapsed).toBeLessThan(500); // generous; real value is a few ms after the cap
  });

  it('still parses a real alert that has a long trailing footer, preserving full raw', () => {
    // The matched text is capped, but a real alert leads with the transaction; the head parses
    // and the FULL original text is preserved on `raw` (on-device only).
    const raw =
      'FAB: AED1,250.00 debited from a/c ***6789 at NOON.COM on 12-06-2026. ' +
      'Terms apply. '.repeat(1000);
    const v = expectOk(parseTransaction(raw));
    expect(v.amountMinor).toBe(125000);
    expect(v.merchant).toBe('NOON.COM');
    expect(v.raw).toBe(raw); // full text retained verbatim
  });
});
