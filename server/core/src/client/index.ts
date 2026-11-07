/**
 * Client-side core: connection, interpolation, prediction, debug overlay, console, bug reports.
 * Owner: platform team. Renderer-independent: nothing here knows how a game draws.
 *
 * Done so far (#13): URL parameters and invite links, per-second meters, the ~ debug overlay with
 * its debug console, the F8 bug report, network simulation, interpolation buffer, prediction with
 * reconciliation.
 * Still to come: state inspector, network stats in the overlay.
 */
export * from "./bugReport.ts";
export * from "./debugConsole.ts";
export * from "./debugOverlay.ts";
export * from "./interpolation.ts";
export * from "./netSim.ts";
export * from "./prediction.ts";
export * from "./rate.ts";
export * from "./urlParams.ts";
