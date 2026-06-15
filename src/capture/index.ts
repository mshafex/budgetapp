/**
 * Public surface of the pure transaction-capture parser (Bucket 2 core).
 *
 * R8: everything exported here is PURE (no platform/native code). Native capture sources
 * (share-sheet, OCR, notification listener) feed raw strings INTO `parseTransaction` from behind
 * the `CaptureSource` boundary — they are not part of this module.
 */
export { parseTransaction } from './parser';
export {
  TEMPLATES,
  amountToFils,
  normalizeDate,
  normalizeDigits,
  guessCategory,
} from './templates';
export type { SourceTemplate, ExtractedFields } from './templates';
