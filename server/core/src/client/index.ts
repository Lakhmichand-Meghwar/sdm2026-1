/**
 * Client-side core: connection, interpolation, prediction, debug overlay, console, bug reports.
 * Owner: platform team. Renderer-independent: nothing here knows how a game draws.
 *
 * Done so far (#13): URL parameters and invite links, per-second meters, the ~ debug overlay,
 * network simulation, interpolation buffer, prediction with reconciliation.
 * Still to come: Colyseus connection and reconnect (needs the room base, #12), debug console,
 * state inspector, F8 bug report.
 */
export * from "./debugOverlay.ts";
export * from "./interpolation.ts";
export * from "./netSim.ts";
export * from "./prediction.ts";
export * from "./rate.ts";
export * from "./urlParams.ts";
