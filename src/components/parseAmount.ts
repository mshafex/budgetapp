/**
 * Pure amount parsing helper for `AmountInput` (DESIGN).
 *
 * Converts free-typed text into integer **fils** (R3 — never float math on money).
 * `AmountInput` is controlled in fils; this is the single place raw text becomes a number.
 *
 * Behaviour:
 *  - Accepts Western digits (0-9) and Arabic-Indic digits (٠-٩) regardless of locale.
 *  - Decimal separator: '.' or the Arabic decimal separator '٫' (U+066B). For `ar`,
 *    a ',' is also accepted as decimal since some keyboards emit it.
 *  - Grouping marks (',', '٬' U+066C, spaces, '_') are stripped.
 *  - Fraction is capped at 2 digits (extra fraction digits are ignored — truncated, never
 *    rounded up, so we never overstate the amount).
 *  - All other junk (letters, currency symbols, stray punctuation) is ignored.
 *  - Empty / digit-less input → 0.
 *  - The result is always a non-negative integer number of fils.
 */

// Arabic-Indic digits ٠١٢٣٤٥٦٧٨٩ → 0..9
const ARABIC_INDIC_ZERO = 0x0660;

function normalizeDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code !== undefined && code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else {
      out += ch;
    }
  }
  return out;
}

export function parseAmountToFils(text: string, locale: string): number {
  if (!text) return 0;

  // 1) Fold Arabic-Indic digits to Western so the rest is plain ASCII math.
  const normalized = normalizeDigits(text);

  // 2) Decide which characters mean "decimal point" for this locale.
  //    '.' and the Arabic decimal separator are always decimal. For `ar`, ',' too.
  const isArabic = locale.toLowerCase().startsWith('ar');
  const decimalChars = isArabic ? ['.', '٫', ','] : ['.', '٫'];

  let intDigits = '';
  let fracDigits = '';
  let seenDecimal = false;
  // Once a SECOND decimal separator appears the input is malformed; stop collecting so we
  // never fabricate fraction digits from across a bad separator.
  let stopped = false;

  for (const ch of normalized) {
    if (stopped) break;
    if (ch >= '0' && ch <= '9') {
      if (seenDecimal) {
        // Keep only the first 2 fraction digits; ignore the rest (truncate, don't round up).
        if (fracDigits.length < 2) fracDigits += ch;
      } else {
        intDigits += ch;
      }
      continue;
    }
    if (decimalChars.includes(ch)) {
      if (seenDecimal) {
        // Second decimal separator — malformed; ignore the remainder.
        stopped = true;
      } else {
        seenDecimal = true;
      }
      continue;
    }
    // Anything else (grouping marks, currency symbols, letters) is ignored.
  }

  if (intDigits === '' && fracDigits === '') return 0;

  const major = intDigits === '' ? 0 : Number.parseInt(intDigits, 10);
  // Pad fraction to exactly 2 digits so "5.4" → 40 fils, "5.45" → 45 fils.
  const fracPadded = (fracDigits + '00').slice(0, 2);
  const fils = Number.parseInt(fracPadded, 10);

  const total = major * 100 + fils;
  // Guard the integer-fils invariant (R3): an absurdly long paste can exceed the safe
  // integer range and yield a non-integer float. Clamp to the largest safe integer so
  // callers never receive a non-integer or precision-lossy amount.
  if (!Number.isSafeInteger(total)) return Number.MAX_SAFE_INTEGER;
  return total;
}
