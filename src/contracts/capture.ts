/**
 * CONTRACT — transaction capture (Bucket 2). Frozen. Parser implemented by C3 in `src/capture`.
 *
 * R8: the parser is PURE (no platform/native code) and tested in isolation. Native capture
 * sources (share-sheet, OCR, notification listener) implement `CaptureSource` and sit BEHIND
 * this interface — the parser/engine/UI never import native code. Every parse result is a
 * CANDIDATE: it is proposed for one-tap confirm/edit, never silently added (confirm-don't-assume).
 * Raw content stays on-device and is never uploaded.
 */
import type { ExpenseCategory } from './entities';

/** A transaction parsed from raw text / notification / receipt. Money is integer fils (R3). */
export interface ParsedTransaction {
  amountMinor: number;
  /** Merchant / counterparty if found, else null. */
  merchant: string | null;
  /** ISO 'YYYY-MM-DD' if found, else null (the confirm UI defaults to today). */
  date: string | null;
  /** Best-guess category, or null for the user to choose on confirm. */
  category: ExpenseCategory | null;
  /** Original raw text — kept on-device only, never uploaded (R8). */
  raw: string;
  /** Which parser template matched (e.g. a bank/source id). */
  sourceKey: string;
}

export type ParseResult =
  | { ok: true; value: ParsedTransaction }
  | { ok: false; reason: string };

/** Pure parser: raw text (+ optional source hint) → a candidate or a miss. No side effects. */
export type TransactionParser = (raw: string, sourceHint?: string) => ParseResult;

/**
 * Platform capture source (Bucket 2 feeds). Native implementations live behind this boundary;
 * each emits raw strings that the pure `TransactionParser` turns into candidates for confirm.
 */
export interface CaptureSource {
  /** Stable id, e.g. 'share-sheet' | 'ocr' | 'notification-listener'. */
  readonly id: string;
  /** Whether this source is usable on the current platform + build (false on unsupported, e.g. iOS notif-listener). */
  isAvailable(): Promise<boolean>;
  /** Register a handler for incoming raw payloads; returns an unsubscribe fn. */
  subscribe(onRaw: (raw: string) => void): () => void;
}
