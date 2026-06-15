/**
 * Pure transaction parser (Bucket 2 — AUTO-CAPTURE, confirm-first).
 *
 * Implements the frozen `TransactionParser` contract (`@/contracts/capture`).
 *
 * R8: PURE. No platform/native code, no I/O, no network, no ambient clock. It turns ONE raw
 * string (a debit/purchase SMS or push notification) into a single CANDIDATE `ParsedTransaction`,
 * or a miss. The candidate is later proposed to the user for one-tap confirm/edit — this module
 * never adds, stores, or transmits anything. The original text is carried on `raw` (kept
 * on-device only by callers; never uploaded).
 *
 * R3: `amountMinor` is always an integer number of fils (templates parse it with integer-only
 * math — no float drift).
 *
 * Contract guarantees:
 *  - Never throws. Any unexpected error becomes `{ ok: false, reason }`.
 *  - On the first matching template returns `{ ok: true, value }`.
 *  - `sourceHint` (optional) only biases template ORDER — a hinted source is tried first, then
 *    the rest follow as a fallback. It never restricts which templates may match.
 */
import type { ParseResult, ParsedTransaction, TransactionParser } from '@/contracts';
import { TEMPLATES, type SourceTemplate } from './templates';

/**
 * Upper bound on the text length we run the template regexes against. A single SMS / push
 * notification is short (~hundreds of chars); even an OCR receipt body is a few KB. Capping the
 * matched text keeps regex work bounded so a pathological or hostile mega-paste cannot pin the JS
 * thread with super-linear backtracking. The FULL original text is still preserved on `value.raw`.
 */
const MAX_MATCH_CHARS = 4000;

/** Collapse runs of whitespace (incl. newlines from multi-line notifications) to single spaces. */
function normalizeWhitespace(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Order templates so any whose `sourceKey` contains the (case-insensitive) hint is tried first,
 * preserving the original relative order within each group. Stable + non-destructive.
 */
function orderBySourceHint(
  templates: ReadonlyArray<SourceTemplate>,
  sourceHint: string,
): SourceTemplate[] {
  const hint = sourceHint.toLowerCase();
  const preferred: SourceTemplate[] = [];
  const rest: SourceTemplate[] = [];
  for (const t of templates) {
    if (t.sourceKey.toLowerCase().includes(hint)) {
      preferred.push(t);
    } else {
      rest.push(t);
    }
  }
  return [...preferred, ...rest];
}

/**
 * Parse a raw transaction alert into a candidate transaction.
 *
 * @param raw        Raw SMS / notification text (kept on-device by callers; on `value.raw`).
 * @param sourceHint Optional source id (e.g. 'fab', 'adcb') that biases template order only.
 */
export const parseTransaction: TransactionParser = (
  raw: string,
  sourceHint?: string,
): ParseResult => {
  try {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return { ok: false, reason: 'empty-input' };
    }

    // Cap the text we MATCH against (regex-cost bound, see MAX_MATCH_CHARS); `raw` is kept whole.
    const text = normalizeWhitespace(raw).slice(0, MAX_MATCH_CHARS);

    const templates =
      sourceHint && sourceHint.trim().length > 0
        ? orderBySourceHint(TEMPLATES, sourceHint.trim())
        : TEMPLATES;

    for (const template of templates) {
      const match = text.match(template.test);
      if (!match) continue;

      // A template may decline a match (e.g. unreadable amount) by returning null; fall through.
      const fields = template.extract(match);
      if (fields == null) continue;

      // Defensive: never emit a non-integer amount even if a template misbehaves (R3 invariant).
      if (!Number.isInteger(fields.amountMinor)) continue;

      const value: ParsedTransaction = {
        amountMinor: fields.amountMinor,
        merchant: fields.merchant ?? null,
        date: fields.date ?? null,
        category: fields.category ?? null,
        // Preserve the ORIGINAL text (not the normalized form) for the confirm UI / audit.
        raw,
        sourceKey: template.sourceKey,
      };
      return { ok: true, value };
    }

    return { ok: false, reason: 'no-template-matched' };
  } catch {
    // R8 / contract: the parser must never throw — degrade to a clean miss.
    return { ok: false, reason: 'parse-error' };
  }
};
