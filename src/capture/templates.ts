/**
 * Per-source parser templates (Bucket 2 — AUTO-CAPTURE, confirm-first).
 *
 * R8: this module is PURE. No platform/native code, no I/O, no network. It only describes how to
 * turn one raw transaction-alert string (debit/purchase SMS or push notification from a UAE bank /
 * wallet) into structured candidate fields. Every result is later proposed for confirm — never
 * silently added.
 *
 * R3: amounts are converted to integer **fils** with NO float drift. We parse the digit string
 * directly (integer arithmetic only — see `amountToFils`), so even very large values keep exact
 * fils and never lose precision through floating-point multiplication.
 *
 * Design: templates are DATA. Adding a new bank/wallet is just appending a `SourceTemplate` —
 * no parser code changes. Each template owns its own regex + a pure `extract(match)`.
 */
import type { ExpenseCategory } from '@/contracts';

/** Fields a template pulls out of a matched alert. Everything except `amountMinor` is optional. */
export interface ExtractedFields {
  /** Amount in integer fils (R3). Required — a template only matches a debit/purchase alert. */
  amountMinor: number;
  /** Merchant / counterparty if the format exposes one, else null. */
  merchant?: string | null;
  /** ISO 'YYYY-MM-DD' if a date was found, else null. */
  date?: string | null;
  /** Best-guess category, else null (user chooses on confirm). */
  category?: ExpenseCategory | null;
}

/**
 * One source template. `sourceKey` is the stable id reported on a match (e.g. a bank id).
 * `test` is the regex tried against the (whitespace-normalized) raw text. `extract` receives the
 * successful `RegExpMatchArray` and returns the structured fields, or `null` to decline the match
 * (e.g. the amount could not be read), letting the parser fall through to the next template.
 */
export interface SourceTemplate {
  readonly sourceKey: string;
  readonly test: RegExp;
  extract(match: RegExpMatchArray): ExtractedFields | null;
}

// ---------------------------------------------------------------------------
// Pure helpers (no platform code, integer-only money math)
// ---------------------------------------------------------------------------

// Arabic-Indic digits ٠١٢٣٤٥٦٧٨٩ → 0..9 (some banks send Arabic-script alerts).
const ARABIC_INDIC_ZERO = 0x0660;

/** Fold Arabic-Indic digits to Western so amount/date parsing is plain ASCII. */
export function normalizeDigits(text: string): string {
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

/**
 * Convert a raw amount token (e.g. "125.50", "1,250", "٩٠", "٩٠٫٥٠") to integer **fils**.
 *
 * Pure integer arithmetic — we never multiply a float by 100, so large values keep exact fils
 * (R3: no float drift). Returns null if no digit is present (the template then declines).
 *
 * Separator rule (UAE / English bank-SMS convention — '.' is decimal, ',' is grouping):
 *  - Arabic-Indic digits are folded first; the Arabic decimal mark '٫' (U+066B) is treated as
 *    '.', the Arabic thousands mark '٬' (U+066C) as ',', and spaces/'_' are dropped as grouping.
 *  - The DECIMAL separator is the LAST '.' (or '٫') in the token. Everything before it (incl. any
 *    ',') is the integer part with groupings stripped; everything after is the fraction.
 *  - A lone ',' is ALWAYS grouping, so "1,250" → 1250 AED (125000 fils), never 1.250.
 *  - The fraction is truncated to 2 digits ("5.4" → 40 fils, "5.999" → 599 fils). Truncation
 *    never rounds up, so we never overstate the amount.
 */
export function amountToFils(rawAmount: string): number | null {
  // Fold Arabic-Indic digits, then map the Arabic decimal/grouping marks to ASCII '.'/','.
  const normalized = normalizeDigits(rawAmount).replace(/٫/g, '.').replace(/٬/g, ',');
  // Keep only digits and the two ASCII separators; drop spaces, '_', currency symbols, letters.
  const cleaned = normalized.replace(/[^0-9.,]/g, '');
  if (!/[0-9]/.test(cleaned)) return null;

  // The decimal point is the LAST '.'; anything before it is the integer part (commas = grouping).
  // A token with no '.' is a whole amount (commas are grouping) — e.g. "1,250" → 1250.
  let intPart: string;
  let fracPart: string;
  const lastDot = cleaned.lastIndexOf('.');
  if (lastDot === -1) {
    intPart = cleaned;
    fracPart = '';
  } else {
    intPart = cleaned.slice(0, lastDot);
    fracPart = cleaned.slice(lastDot + 1);
  }

  // Strip every separator from each part (the integer keeps only digits; a fraction never groups).
  const intDigits = intPart.replace(/[.,]/g, '');
  const fracDigits = fracPart.replace(/[.,]/g, '');
  const safeIntDigits = intDigits === '' ? '0' : intDigits;

  // Build the fils string by integer concatenation: <intDigits><2-digit frac>. This avoids any
  // float multiply (`major * 100`) and stays exact for arbitrarily large amounts. The fraction is
  // truncated to 2 digits (never rounded up).
  const fracPadded = (fracDigits + '00').slice(0, 2);
  const filsDigits = safeIntDigits + fracPadded;

  const fils = Number.parseInt(filsDigits, 10);
  if (!Number.isFinite(fils)) return null;
  // Guard the integer-fils invariant for absurdly long inputs.
  if (!Number.isSafeInteger(fils)) return Number.MAX_SAFE_INTEGER;
  return fils;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Reject impossible day-of-month (e.g. 31/02). Constructed in UTC to avoid TZ drift.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/**
 * Normalize a date token to ISO 'YYYY-MM-DD', or null if it cannot be read confidently.
 *
 * Accepts (day-first, as is standard in the UAE):
 *  - dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
 *  - dd/mm/yy, dd-mm-yy  (yy → 20yy)
 *  - dd/mm, dd-mm        (no year → the confirm UI fills today's year; we return null year-less
 *    dates as null so we never guess a wrong year)
 *  - dd-MMM-yyyy / dd MMM yyyy  (e.g. 03 Jun 2026)
 *
 * Pure: no ambient clock, no Date.now — we never invent "today".
 */
export function normalizeDate(rawDate: string): string | null {
  // Fold Arabic-Indic digits, then trim surrounding whitespace and sentence punctuation a capture
  // commonly drags in (e.g. a trailing '.' from end-of-sentence: "03/06/2026.").
  const s = normalizeDigits(rawDate)
    .trim()
    .replace(/^[^0-9A-Za-z]+/, '')
    .replace(/[^0-9A-Za-z]+$/, '');

  // dd MMM yyyy / dd-MMM-yyyy (e.g. "03 Jun 2026", "3-Jun-26")
  const named = s.match(/^([0-9]{1,2})[\s./-]+([A-Za-z]{3,})[\s./-]+([0-9]{2,4})$/);
  if (named) {
    const d = Number.parseInt(named[1], 10);
    const m = MONTHS[named[2].slice(0, 3).toLowerCase()];
    let y = Number.parseInt(named[3], 10);
    if (m !== undefined) {
      if (y < 100) y += 2000;
      if (isValidYmd(y, m, d)) return `${y}-${pad2(m)}-${pad2(d)}`;
    }
    return null;
  }

  // dd/mm/yyyy | dd-mm-yy | dd.mm  (day-first numeric)
  const numeric = s.match(/^([0-9]{1,2})[./-]([0-9]{1,2})(?:[./-]([0-9]{2,4}))?$/);
  if (numeric) {
    const d = Number.parseInt(numeric[1], 10);
    const m = Number.parseInt(numeric[2], 10);
    if (numeric[3] === undefined) {
      // No year present — do not guess one. The confirm UI defaults the year (and the whole date
      // if null). Returning null keeps us from fabricating a possibly-wrong year.
      return null;
    }
    let y = Number.parseInt(numeric[3], 10);
    if (y < 100) y += 2000;
    if (isValidYmd(y, m, d)) return `${y}-${pad2(m)}-${pad2(d)}`;
    return null;
  }

  return null;
}

/** Trim trailing punctuation/separators a merchant capture commonly drags in. */
function trimMerchant(raw: string): string | null {
  const m = raw.trim().replace(/[\s.,;:*#/\\-]+$/, '').trim();
  return m.length > 0 ? m : null;
}

/**
 * Words that mark the end of a merchant name in an alert tail. The merchant is everything from the
 * connector ("at"/"@"/"to") up to the first of these clause boundaries (or end of string).
 * Includes both English and the Arabic "on/dated" (بتاريخ). NOTE: `\b` is ASCII-word based and
 * does not fire next to Arabic letters, so the Arabic keyword is bounded by whitespace only.
 */
const TAIL_BOUNDARY = /\s+(?:(?:on|dated|date|ref|reference|approved|avbl|available|bal\.?|balance|wallet|with)\b|بتاريخ(?:\s|$))/i;

/** A date token following "on"/"dated"/"بتاريخ" inside the tail, if present. */
const TAIL_DATE = /(?:\b(?:on|dated)\s+|بتاريخ\s+)([\w./-]+)/i;

/**
 * Split a greedily-captured "tail" (everything after the merchant connector — e.g. the text after
 * "at"/"@"/"to") into a clean merchant and an optional ISO date.
 *
 * This avoids fragile lazy-vs-greedy regex tuning per template: each template captures the whole
 * tail, and this one pure helper deterministically pulls out merchant (up to the first clause
 * boundary) and the date (from any "on <date>" / "بتاريخ <date>" inside the tail).
 */
function splitMerchantAndDate(tail: string | undefined | null): {
  merchant: string | null;
  date: string | null;
} {
  if (tail == null) return { merchant: null, date: null };

  const dateMatch = tail.match(TAIL_DATE);
  const date = dateMatch ? normalizeDate(dateMatch[1]) : null;

  // Merchant = text up to the first clause boundary (or the whole tail if there is none).
  const boundary = tail.search(TAIL_BOUNDARY);
  const merchantRaw = boundary === -1 ? tail : tail.slice(0, boundary);

  return { merchant: trimMerchant(merchantRaw), date };
}

/**
 * Tiny keyword categorizer — best-guess only; null when unsure (R8: the user confirms/picks).
 * Intentionally conservative: a wrong silent guess erodes trust, an absent guess just asks.
 */
const CATEGORY_RULES: ReadonlyArray<readonly [RegExp, ExpenseCategory]> = [
  [/\b(carrefour|lulu|spinneys|grocer|supermarket|restaurant|cafe|coffee|talabat|deliveroo|zomato|noon\s*food|mcdonald|kfc|starbucks)\b/i, 'food'],
  [/\b(careem|uber|taxi|rta|metro|adnoc|enoc|eppco|petrol|fuel|parking|salik|emirates|fly|airline)\b/i, 'transport'],
  [/\b(du|etisalat|dewa|sewa|addc|fewa|electricity|water|internet|telecom|utility|bill)\b/i, 'bills'],
  [/\b(noon|amazon|namshi|sharaf|emax|jumbo|mall|store|shop|ikea|h&m|zara|centrepoint)\b/i, 'shopping'],
  [/\b(pharmacy|aster|medcare|hospital|clinic|nmc|life\s*pharmacy|dentist|medical)\b/i, 'health'],
];

/** Best-guess category from a merchant string; null when nothing matches. */
export function guessCategory(merchant: string | null): ExpenseCategory | null {
  if (!merchant) return null;
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(merchant)) return cat;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Templates — realistic UAE bank / wallet debit & purchase alerts
// ---------------------------------------------------------------------------
//
// Currency tokens covered: "AED 125.50", "AED1,250", "AED 90.00", "د.إ 90", "90 AED".
// Keep these ordered most-specific → most-generic; the parser tries them in order and returns the
// first that both matches AND yields a readable amount.

// English merchant connector ("at <merchant>" / "@ <merchant>"). The tail after the connector is
// captured GREEDILY to end-of-string and handed to `splitMerchantAndDate`, which trims off any
// trailing "on <date>" / clause — far more robust than tuning lazy-vs-greedy per template. When no
// connector is present the second branch consumes the remaining text so `$` still anchors (so an
// amount-only message like "...AED 30.25 approved." matches with a null merchant).
const EN_TAIL = String.raw`(?:[\s\S]*?(?:\bat\b|@)\s+(.*)|[\s\S]*)$`;

/**
 * The standard extractor shared by every template here: group 1 is the amount token, group 2 (if
 * present) is the greedily-captured merchant tail. All current templates use this exact shape, so
 * one shared function serves them all. Declines (returns null) when the amount can't be read.
 */
const standardExtract: SourceTemplate['extract'] = (match) => {
  const amountMinor = amountToFils(match[1]);
  if (amountMinor == null) return null;
  const { merchant, date } = splitMerchantAndDate(match[2]);
  return { amountMinor, merchant, date, category: guessCategory(merchant) };
};

/**
 * ADCB-style purchase alert.
 * e.g. "ADCB: Your Card ending 1234 was used for AED 125.50 at CARREFOUR MALL OF EMIRATES on 03/06/2026."
 */
const adcbPurchase: SourceTemplate = {
  sourceKey: 'adcb-card-purchase',
  test: new RegExp(String.raw`\bADCB\b[\s\S]*?\bAED\s*([\d.,]+)\b` + EN_TAIL, 'i'),
  extract: standardExtract,
};

/**
 * FAB-style debit alert (amount can be glued to the currency, with thousands commas).
 * e.g. "FAB: AED1,250.00 debited from a/c ***6789 at NOON.COM on 12-06-2026. Avbl bal AED 3,400."
 */
const fabDebit: SourceTemplate = {
  sourceKey: 'fab-account-debit',
  test: new RegExp(String.raw`\bFAB\b[\s\S]*?\bAED\s*([\d.,]+)\s+debited\b` + EN_TAIL, 'i'),
  extract: standardExtract,
};

/**
 * Emirates NBD-style purchase alert, merchant after "@", date as "dd-MMM-yyyy".
 * e.g. "Emirates NBD: Purchase of AED 90.00 @ TALABAT on 03-Jun-2026 with Debit Card ending 4321."
 */
const enbdPurchase: SourceTemplate = {
  sourceKey: 'enbd-card-purchase',
  test: new RegExp(String.raw`Emirates\s*NBD\b[\s\S]*?\bAED\s*([\d.,]+)\b` + EN_TAIL, 'i'),
  extract: standardExtract,
};

/**
 * Arabic-script bank alert. Amount may use Arabic-Indic digits and the "د.إ" currency mark.
 * e.g. "تم خصم د.إ ٩٠٫٥٠ من بطاقتك لدى كارفور بتاريخ 03/06/2026"
 *   (خصم = debit, لدى = "at", بتاريخ = "on/dated").
 */
const arabicDebit: SourceTemplate = {
  sourceKey: 'arabic-card-debit',
  test: /خصم[\s\S]*?د\.إ\s*([\d.,٠-٩٫٬]+)(?:[\s\S]*?لدى\s+(.*))?$/,
  // Arabic merchant names won't hit the (English) keyword rules — category stays null for confirm.
  extract: standardExtract,
};

/**
 * Wallet (e.g. Careem Pay / generic wallet) push: "You paid AED 45.00 to <merchant>".
 * e.g. "You paid AED 45.00 to CAREEM RIDE. Wallet balance AED 210.00."
 */
const walletPayment: SourceTemplate = {
  sourceKey: 'wallet-payment',
  test: /\b(?:you\s+)?(?:paid|sent)\s+AED\s*([\d.,]+)(?:[\s\S]*?\bto\s+(.*))?$/i,
  extract: standardExtract,
};

// A debit/purchase intent keyword. Required by the generic templates so they never fire on a
// balance enquiry, salary credit, OTP, or marketing message that merely contains "AED <amount>".
const DEBIT_KEYWORD = String.raw`(?:debit(?:ed)?|purchase[ds]?|spent|spend|payment|withdrawn|withdrawal|paid|used\s+for|used\s+at|charged)`;

/**
 * Generic fallback debit/purchase alert from any bank/card, "AED <amount>" with optional
 * "at/@ <merchant>" + "on <date>". Catches phrasings the specific templates miss. The debit/
 * purchase keyword may appear on EITHER side of the amount, so both "debited AED 12 at X" and
 * "AED 0.99 ... debited" match — but balance/credit/OTP/marketing never do.
 * e.g. "Your account was debited AED 12 at ADNOC STATION 123 on 1-6-26."
 *
 * Note: this grabs the FIRST "AED <amount>" in the message. A bank alert describes ONE
 * transaction, so that is the right amount. A pathological multi-amount string (e.g. a credit and
 * a debit in one text) could pick the wrong figure — acceptable because every parse is a CANDIDATE
 * the user confirms/edits before it ever counts (R8, confirm-don't-assume).
 */
const genericDebit: SourceTemplate = {
  sourceKey: 'generic-card-debit',
  test: new RegExp(
    String.raw`(?=[\s\S]*\b${DEBIT_KEYWORD}\b)[\s\S]*?\bAED\s*([\d.,]+)\b` + EN_TAIL,
    'i',
  ),
  extract: standardExtract,
};

/**
 * Generic fallback where the currency trails the amount ("90 AED ... debited"), still gated on a
 * debit/purchase keyword (either side). e.g. "Purchase 90 AED at SPINNEYS approved."
 */
const genericTrailingCurrency: SourceTemplate = {
  sourceKey: 'generic-trailing-currency',
  test: new RegExp(
    String.raw`(?=[\s\S]*\b${DEBIT_KEYWORD}\b)[\s\S]*?\b([\d.,]+)\s*AED\b` + EN_TAIL,
    'i',
  ),
  extract: standardExtract,
};

/**
 * Ordered template list. Specific banks first, generic catch-alls last. The parser walks this in
 * order and returns the first template that matches AND yields a readable amount. Add a new
 * source by appending a `SourceTemplate` here — no parser changes required.
 */
export const TEMPLATES: ReadonlyArray<SourceTemplate> = [
  adcbPurchase,
  fabDebit,
  enbdPurchase,
  arabicDebit,
  walletPayment,
  genericDebit,
  genericTrailingCurrency,
];
