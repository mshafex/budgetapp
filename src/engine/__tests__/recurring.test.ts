/**
 * Unit tests for the PURE recurring auto-post scheduler (`src/engine/recurring.ts`).
 *
 * Bucket 1 / Model A: the scheduler emits dated `ExpenseInput`s tagged `source: 'recurring'`
 * for fixed items due within the cycle, idempotently. No I/O, no clock — `today` and the
 * cycle bounds are injected. These tests cover every contract obligation: backfill of
 * past-due, due-today, multiple missed periods, the cycle boundary, idempotency via
 * `postedKeys`, the dueDay default + month-length clamp, each `CycleKind`, and the
 * type→category mapping.
 */
import {
  categoryForFixedItemType,
  computeDuePostings,
  makeRecurringKey,
} from '@/engine';
import type {
  ExpenseInput,
  FixedItem,
  FixedItemType,
  RecurringPostingInput,
} from '@/contracts';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function makeItem(overrides: Partial<FixedItem> = {}): FixedItem {
  return {
    id: 1,
    label: 'Rent',
    amountMinor: 200000, // 2,000 AED
    type: 'rent',
    cycle: 'monthly',
    dueDay: 1,
    ...overrides,
  };
}

/** A monthly cycle that opened on the 1st; tests override `today`/items as needed. */
function makeInput(overrides: Partial<RecurringPostingInput> = {}): RecurringPostingInput {
  return {
    fixedItems: [],
    today: '2026-06-15',
    cycleStart: '2026-06-01',
    cycleEnd: '2026-07-01',
    postedKeys: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* makeRecurringKey                                                    */
/* ------------------------------------------------------------------ */

describe('makeRecurringKey', () => {
  it('formats as `${id}:${dueDateISO}`', () => {
    expect(makeRecurringKey(7, '2026-06-01')).toBe('7:2026-06-01');
  });

  it('is stable for the same id + date (idempotency depends on it)', () => {
    expect(makeRecurringKey(3, '2026-01-15')).toBe(makeRecurringKey(3, '2026-01-15'));
  });

  it('differs by id and by date', () => {
    expect(makeRecurringKey(1, '2026-06-01')).not.toBe(makeRecurringKey(2, '2026-06-01'));
    expect(makeRecurringKey(1, '2026-06-01')).not.toBe(makeRecurringKey(1, '2026-07-01'));
  });
});

/* ------------------------------------------------------------------ */
/* type -> category mapping                                            */
/* ------------------------------------------------------------------ */

describe('categoryForFixedItemType', () => {
  it('maps rent / bill / loan to bills', () => {
    expect(categoryForFixedItemType('rent')).toBe('bills');
    expect(categoryForFixedItemType('bill')).toBe('bills');
    expect(categoryForFixedItemType('loan')).toBe('bills');
  });

  it('maps remittance to family (R6: tracking label, never money movement)', () => {
    expect(categoryForFixedItemType('remittance')).toBe('family');
  });

  it('maps other to other', () => {
    expect(categoryForFixedItemType('other')).toBe('other');
  });

  it('covers every FixedItemType (no silent fall-through)', () => {
    const all: FixedItemType[] = ['rent', 'loan', 'remittance', 'bill', 'other'];
    for (const t of all) {
      expect(() => categoryForFixedItemType(t)).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ */
/* Monthly — the common case                                          */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — monthly (common case)', () => {
  it('posts a single due item whose date already passed (backfill within the cycle)', () => {
    // Cycle opened 2026-06-01, rent due day 1, today is the 15th → the 1st is past-due.
    const out = computeDuePostings(
      makeInput({ fixedItems: [makeItem({ dueDay: 1 })] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual<ExpenseInput>({
      amountMinor: 200000,
      category: 'bills',
      note: 'Rent',
      source: 'recurring',
      recurringKey: '1:2026-06-01',
      createdAt: '2026-06-01',
    });
  });

  it('posts an item due TODAY', () => {
    // dueDay 15, today the 15th.
    const out = computeDuePostings(
      makeInput({ today: '2026-06-15', fixedItems: [makeItem({ dueDay: 15 })] }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe('2026-06-15');
    expect(out[0].recurringKey).toBe('1:2026-06-15');
  });

  it('does NOT post an item whose due date is still in the future this cycle', () => {
    // dueDay 25, today the 15th → not due yet.
    const out = computeDuePostings(
      makeInput({ today: '2026-06-15', fixedItems: [makeItem({ dueDay: 25 })] }),
    );
    expect(out).toHaveLength(0);
  });

  it('uses item.label as the note and item.amountMinor as the amount', () => {
    const out = computeDuePostings(
      makeInput({
        fixedItems: [
          makeItem({ id: 9, label: 'Home internet', amountMinor: 30000, type: 'bill', dueDay: 5 }),
        ],
      }),
    );
    expect(out[0].note).toBe('Home internet');
    expect(out[0].amountMinor).toBe(30000);
    expect(out[0].category).toBe('bills');
  });
});

/* ------------------------------------------------------------------ */
/* dueDay default + month-length clamp                                 */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — dueDay default + month-length clamp', () => {
  it('defaults a missing dueDay (undefined) to day 1', () => {
    const item = makeItem();
    delete (item as { dueDay?: number | null }).dueDay; // truly absent
    const out = computeDuePostings(makeInput({ fixedItems: [item] }));
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe('2026-06-01');
  });

  it('defaults a null dueDay to day 1', () => {
    const out = computeDuePostings(
      makeInput({ fixedItems: [makeItem({ dueDay: null })] }),
    );
    expect(out[0].createdAt).toBe('2026-06-01');
  });

  it('clamps dueDay 31 to the month length (February, non-leap)', () => {
    // Feb 2026 has 28 days; dueDay 31 → due Feb 28.
    const out = computeDuePostings(
      makeInput({
        today: '2026-02-28',
        cycleStart: '2026-02-01',
        cycleEnd: '2026-03-01',
        fixedItems: [makeItem({ dueDay: 31 })],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe('2026-02-28');
  });

  it('clamps dueDay 31 across a leap-year February (Feb 29)', () => {
    const out = computeDuePostings(
      makeInput({
        today: '2024-02-29',
        cycleStart: '2024-02-01',
        cycleEnd: '2024-03-01',
        fixedItems: [makeItem({ dueDay: 31 })],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe('2024-02-29');
  });

  it('rejects an out-of-range dueDay', () => {
    expect(() =>
      computeDuePostings(makeInput({ fixedItems: [makeItem({ dueDay: 0 })] })),
    ).toThrow();
    expect(() =>
      computeDuePostings(makeInput({ fixedItems: [makeItem({ dueDay: 32 })] })),
    ).toThrow();
    expect(() =>
      computeDuePostings(makeInput({ fixedItems: [makeItem({ dueDay: 1.5 })] })),
    ).toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Multiple periods missed within the cycle                            */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — multiple periods missed (backfill)', () => {
  it('weekly: backfills every weekly occurrence from cycle start through today', () => {
    // Cycle 2026-06-01 .. 2026-07-01, dueDay 1 anchors the weekly walk.
    // Occurrences on/after 06-01 and <= today (06-22): 06-01, 06-08, 06-15, 06-22.
    const out = computeDuePostings(
      makeInput({
        today: '2026-06-22',
        fixedItems: [makeItem({ cycle: 'weekly', dueDay: 1, amountMinor: 5000 })],
      }),
    );
    expect(out.map((p) => p.createdAt)).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
    ]);
    // Each carries a distinct key + the recurring source.
    expect(new Set(out.map((p) => p.recurringKey)).size).toBe(4);
    expect(out.every((p) => p.source === 'recurring')).toBe(true);
  });

  it('weekly: stops at today, not at cycle end (future occurrences are not backfilled)', () => {
    const out = computeDuePostings(
      makeInput({
        today: '2026-06-10',
        fixedItems: [makeItem({ cycle: 'weekly', dueDay: 1 })],
      }),
    );
    // Only 06-01 and 06-08 are <= 06-10.
    expect(out.map((p) => p.createdAt)).toEqual(['2026-06-01', '2026-06-08']);
  });
});

/* ------------------------------------------------------------------ */
/* Each CycleKind                                                      */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — each CycleKind in a wide window', () => {
  // A 13-month window so quarterly/yearly produce multiple/clamped results.
  const wide = {
    today: '2027-01-01',
    cycleStart: '2026-01-01',
    cycleEnd: '2027-02-01',
  };

  it('monthly posts one occurrence per month', () => {
    const out = computeDuePostings(
      makeInput({ ...wide, fixedItems: [makeItem({ cycle: 'monthly', dueDay: 1 })] }),
    );
    // 2026-01-01 .. 2027-01-01 inclusive = 13 occurrences.
    expect(out).toHaveLength(13);
    expect(out[0].createdAt).toBe('2026-01-01');
    expect(out[out.length - 1].createdAt).toBe('2027-01-01');
  });

  it('quarterly posts every 3 months', () => {
    const out = computeDuePostings(
      makeInput({ ...wide, fixedItems: [makeItem({ cycle: 'quarterly', dueDay: 1 })] }),
    );
    expect(out.map((p) => p.createdAt)).toEqual([
      '2026-01-01',
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
      '2027-01-01',
    ]);
  });

  it('yearly posts once per year', () => {
    const out = computeDuePostings(
      makeInput({ ...wide, fixedItems: [makeItem({ cycle: 'yearly', dueDay: 1 })] }),
    );
    expect(out.map((p) => p.createdAt)).toEqual(['2026-01-01', '2027-01-01']);
  });

  it('weekly posts every 7 days', () => {
    const out = computeDuePostings(
      makeInput({
        today: '2026-01-29',
        cycleStart: '2026-01-01',
        cycleEnd: '2026-02-01',
        fixedItems: [makeItem({ cycle: 'weekly', dueDay: 1 })],
      }),
    );
    expect(out.map((p) => p.createdAt)).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Cycle boundary                                                      */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — cycle boundary', () => {
  it('includes a posting on cycleStart (lower bound inclusive)', () => {
    const out = computeDuePostings(
      makeInput({
        today: '2026-06-01',
        cycleStart: '2026-06-01',
        cycleEnd: '2026-07-01',
        fixedItems: [makeItem({ dueDay: 1 })],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toBe('2026-06-01');
  });

  it('EXCLUDES a posting that lands exactly on cycleEnd (upper bound exclusive)', () => {
    // dueDay 1; today is on the next pay date itself. The 07-01 occurrence belongs to the
    // NEXT cycle and must not be posted into this one; the 06-01 occurrence still posts.
    const out = computeDuePostings(
      makeInput({
        today: '2026-07-01',
        cycleStart: '2026-06-01',
        cycleEnd: '2026-07-01',
        fixedItems: [makeItem({ dueDay: 1 })],
      }),
    );
    expect(out.map((p) => p.createdAt)).toEqual(['2026-06-01']);
  });

  it('clamps the window to today when today is before cycleEnd', () => {
    // dueDay 1; cycle Jun→Jul; today mid-cycle → only the 06-01 occurrence.
    const out = computeDuePostings(
      makeInput({ today: '2026-06-20', fixedItems: [makeItem({ dueDay: 1 })] }),
    );
    expect(out.map((p) => p.createdAt)).toEqual(['2026-06-01']);
  });

  it('returns nothing when today is before cycleStart (cycle not yet begun)', () => {
    const out = computeDuePostings(
      makeInput({
        today: '2026-05-20',
        cycleStart: '2026-06-01',
        cycleEnd: '2026-07-01',
        fixedItems: [makeItem({ dueDay: 1 })],
      }),
    );
    expect(out).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Idempotency via postedKeys                                          */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — idempotency', () => {
  it('skips any posting whose key is already in postedKeys', () => {
    const out = computeDuePostings(
      makeInput({
        fixedItems: [makeItem({ dueDay: 1 })],
        postedKeys: ['1:2026-06-01'],
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('a re-run feeding back the first run\'s keys posts nothing new', () => {
    const item = makeItem({ cycle: 'weekly', dueDay: 1 });
    const first = computeDuePostings(makeInput({ today: '2026-06-22', fixedItems: [item] }));
    expect(first.length).toBeGreaterThan(0);

    const postedKeys = first.map((p) => p.recurringKey).filter((k): k is string => k != null);
    const second = computeDuePostings(
      makeInput({ today: '2026-06-22', fixedItems: [item], postedKeys }),
    );
    expect(second).toHaveLength(0);
  });

  it('posts only the newly-due occurrence when time advances one period', () => {
    const item = makeItem({ cycle: 'weekly', dueDay: 1 });
    // First run at 06-08 posts 06-01 + 06-08.
    const first = computeDuePostings(makeInput({ today: '2026-06-08', fixedItems: [item] }));
    const postedKeys = first.map((p) => p.recurringKey).filter((k): k is string => k != null);
    // Advance to 06-15: only the 06-15 occurrence is new.
    const second = computeDuePostings(
      makeInput({ today: '2026-06-15', fixedItems: [item], postedKeys }),
    );
    expect(second.map((p) => p.createdAt)).toEqual(['2026-06-15']);
  });

  it('does not double-post within a single run (same item + date appears once)', () => {
    const out = computeDuePostings(
      makeInput({ fixedItems: [makeItem({ dueDay: 1 })] }),
    );
    const keys = out.map((p) => p.recurringKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/* ------------------------------------------------------------------ */
/* Multiple items + ordering                                          */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — multiple items', () => {
  it('posts due items for every recurring item, ordered by due date', () => {
    const items: FixedItem[] = [
      makeItem({ id: 1, label: 'Rent', type: 'rent', dueDay: 1, amountMinor: 200000 }),
      makeItem({ id: 2, label: 'Remittance', type: 'remittance', dueDay: 5, amountMinor: 50000 }),
      makeItem({ id: 3, label: 'Car loan', type: 'loan', dueDay: 10, amountMinor: 90000 }),
      // due day 25 — not yet reached on the 15th, must NOT post.
      makeItem({ id: 4, label: 'Phone', type: 'bill', dueDay: 25, amountMinor: 8000 }),
    ];
    const out = computeDuePostings(makeInput({ today: '2026-06-15', fixedItems: items }));
    expect(out.map((p) => ({ note: p.note, createdAt: p.createdAt, category: p.category }))).toEqual([
      { note: 'Rent', createdAt: '2026-06-01', category: 'bills' },
      { note: 'Remittance', createdAt: '2026-06-05', category: 'family' },
      { note: 'Car loan', createdAt: '2026-06-10', category: 'bills' },
    ]);
  });

  it('returns an empty array when there are no fixed items', () => {
    expect(computeDuePostings(makeInput({ fixedItems: [] }))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

describe('computeDuePostings — input validation', () => {
  it('rejects a malformed date string', () => {
    expect(() =>
      computeDuePostings(makeInput({ today: '06/15/2026', fixedItems: [makeItem()] })),
    ).toThrow();
    expect(() =>
      computeDuePostings(makeInput({ cycleStart: '2026-13-01', fixedItems: [makeItem()] })),
    ).toThrow();
  });
});
