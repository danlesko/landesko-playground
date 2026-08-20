import { vi } from "vitest";

/**
 * A stand-in for `@vercel/postgres`'s `sql` tagged template.
 *
 * It records the query text exactly as the *application* wrote it, with each
 * interpolated value replaced by its placeholder (`$1`, `$2`, ...) the way the
 * real driver parameterises them. The mock makes no decisions of its own — it
 * only observes — so an assertion such as "the anonymous query text contains
 * `private != TRUE`" fails the moment that clause is removed from
 * `src/lib/data.ts`.
 *
 * Use it with a lazy `vi.mock` factory, which is the only way to reference a
 * module-scoped helper from inside a hoisted mock:
 *
 * ```ts
 * vi.mock("@vercel/postgres", async () => {
 *   const { sql } = await import("@/test/sql-mock");
 *   return { sql };
 * });
 * ```
 */
export interface SqlCall {
  /** Query text with `$n` placeholders where values were interpolated. */
  text: string;
  /** The interpolated values, in order. */
  values: unknown[];
}

export interface QueryResultLike {
  rows: unknown[];
  rowCount?: number;
}

const calls: SqlCall[] = [];
const queuedResults: QueryResultLike[] = [];
let queuedError: Error | null = null;

export const sql = vi.fn(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (acc, chunk, index) =>
        acc + chunk + (index < values.length ? `$${index + 1}` : ""),
      "",
    );
    calls.push({ text, values });

    if (queuedError) return Promise.reject(queuedError);

    const result = queuedResults.shift() ?? { rows: [], rowCount: 0 };
    return Promise.resolve({ rowCount: result.rows.length, ...result });
  },
);

/** Queues the result of the next `sql` call. */
export function queueSqlResult(rows: unknown[]): void {
  queuedResults.push({ rows });
}

/** Makes every subsequent `sql` call reject with `error`. */
export function failNextSqlCalls(error: Error): void {
  queuedError = error;
}

/** Every recorded call, in order. */
export function sqlCalls(): readonly SqlCall[] {
  return calls;
}

/**
 * The single call the code under test made. Asserting on exactly one call is
 * deliberate: a branch that issued two queries, or none, is a regression.
 */
export function onlySqlCall(): SqlCall {
  if (calls.length !== 1) {
    throw new Error(`Expected exactly one sql call, got ${calls.length}.`);
  }
  const [call] = calls;
  if (!call) throw new Error("Unreachable: length was checked above.");
  return call;
}

/** Collapses whitespace so assertions survive reformatting of the query. */
export function normalizeSql(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function resetSqlMock(): void {
  calls.length = 0;
  queuedResults.length = 0;
  queuedError = null;
  sql.mockClear();
}
