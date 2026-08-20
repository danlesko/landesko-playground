import { vi } from "vitest";

/**
 * Mocks for the Next.js modules the data and action layers import. Kept in one
 * place so every test file mocks them the same way.
 */

/**
 * `redirect()` signals by throwing an internal error that Next catches at the
 * framework boundary, so callers never see the code after it. The mock keeps
 * that contract: a test that forgets to expect the throw fails.
 */
export class MockRedirect extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT to ${url}`);
    this.name = "MockRedirect";
  }
}

export const redirect = vi.fn((url: string): never => {
  throw new MockRedirect(url);
});

export const revalidatePath = vi.fn<(path: string) => void>();

export const unstable_noStore = vi.fn<() => void>();

export function resetNextMocks(): void {
  redirect.mockClear();
  revalidatePath.mockClear();
  unstable_noStore.mockClear();
}

/**
 * Asserts that `run` redirected to `url`, and returns nothing otherwise.
 * Rethrows anything that is not a redirect so real failures are not swallowed.
 */
export async function expectRedirect(
  run: () => Promise<unknown>,
  url: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof MockRedirect) {
      if (error.url !== url) {
        throw new Error(`Expected a redirect to ${url}, got ${error.url}.`);
      }
      return;
    }
    throw error;
  }
  throw new Error(`Expected a redirect to ${url}, but none was thrown.`);
}
