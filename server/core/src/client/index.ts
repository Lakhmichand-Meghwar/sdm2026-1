/**
 * Client-side core: connection, interpolation, prediction, debug overlay, console, bug reports.
 * Owner: platform team. Renderer-independent: nothing here knows how a game draws.
 *
 * Done so far (#13): URL parameters and invite links, per-second meters, the ~ debug overlay.
 * Still to come: Colyseus connection and reconnect (needs the room base, #12), interpolation,
 * prediction, network simulation, debug console, F8 bug report.
 */
export * from "./debugOverlay.ts";
export * from "./rate.ts";
export * from "./urlParams.ts";
