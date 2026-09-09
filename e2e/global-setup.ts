import { databaseConfigured, sweepAuthoringRows } from "./fixtures";

/**
 * Clears rows a previous run left behind, before any worker starts.
 *
 * Per-test cleanup handles a failing test but cannot handle a killed worker, a `^C`, or a
 * crashed run -- in those cases nothing runs at all. A prefix delete covers exactly those,
 * and HERE it is safe: `globalSetup` runs once in the runner before the first test exists,
 * so it cannot race one. The same statement in `afterEach` was a real defect.
 */
export default async function globalSetup() {
  if (!databaseConfigured) return;
  await sweepAuthoringRows();
}
