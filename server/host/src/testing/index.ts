/**
 * Test helpers for room tests in every game: `import { boot } from "@sdm/host/testing"`.
 * Re-exported from the host so tests use the host's single copy of the Colyseus runtime.
 */
export { boot, type ColyseusTestServer } from "@colyseus/testing";
export { captureLog, type LogLine } from "./captureLog.ts";
