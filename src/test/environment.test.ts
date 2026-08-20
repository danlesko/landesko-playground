import { describe, expect, it } from "vitest";

/**
 * Meta-tests for the guards in `setup.ts`. They exist so that a future change
 * which quietly drops the setup file, or reintroduces a connection string,
 * fails the suite instead of silently pointing the tests at production.
 */
describe("test environment", () => {
  it("has no Postgres connection string", () => {
    expect(process.env.POSTGRES_URL).toBeUndefined();
    expect(process.env.POSTGRES_URL_NON_POOLING).toBeUndefined();
    expect(process.env.POSTGRES_PRISMA_URL).toBeUndefined();
    expect(process.env.DATABASE_URL).toBeUndefined();
  });

  it("has no real reCAPTCHA or auth secret", () => {
    expect(process.env.SITE_SECRET_RECAPTCHA).toBeUndefined();
    expect(process.env.AUTH_SECRET).toBeUndefined();
  });

  it("refuses outbound HTTP that a test has not explicitly stubbed", () => {
    expect(() =>
      fetch("https://www.google.com/recaptcha/api/siteverify"),
    ).toThrow(/Unexpected network access/);
  });
});
