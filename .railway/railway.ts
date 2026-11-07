/**
 * Railway infrastructure for sdm2026-1: one project, two environments, one service per game.
 *
 *   production   deploys `prod` (release PRs from main only)
 *   development  deploys `main`
 *
 * Change it through a reviewed platform PR that includes the `railway config plan` output for both
 * environments, then apply from an up-to-date `main` (see "Railway" in server/ARCHITECTURE.md).
 * Anything missing from this file is DELETED on apply. The rules are in "Deploying to Railway" in CLAUDE.md.
 *
 * The Railway CLI runs this file with `node --experimental-strip-types`: keep it erasable TypeScript
 * (no enums, no namespaces) and import only Node built-ins and `railway/iac`.
 */
import { existsSync, readFileSync } from "node:fs";
import { defineRailway, github, project, service } from "railway/iac";

const REPO = "nd2003/sdm2026-1";
const PROJECT = "sdm2026-1";

/** Every service runs in one EU region, close to the players. */
export const REGION = "europe-west4";

/** The server listens on $PORT. Fixed, so a domain can target it: `railway domain --port 8080`. */
export const PORT = "8080";

/** Railway environment → the branch it deploys and the APP_ENV the code (and /health) sees. */
export const ENVIRONMENTS = {
  production: { branch: "prod", appEnv: "production" },
  development: { branch: "main", appEnv: "development" },
} as const;

export type EnvironmentName = keyof typeof ENVIRONMENTS;

interface Game {
  /** Railway service name. */
  service: string;
  /** Folder of the game package, relative to the repo root. Holds `server.ts`. */
  dir: string;
  /** Package name, for `pnpm --filter`. */
  package: string;
}

/**
 * One service per game. Add a team's game here, in a platform PR, once its package is on `main`
 * (e.g. `{ service: "team-2", dir: "games/team-2", package: "@team-2/game" }`).
 */
export const GAMES: readonly Game[] = [
  { service: "template", dir: "server/template", package: "@sdm/template" },
];

/** Platform files every game runs on: a change here redeploys every game. */
const PLATFORM_WATCH = [
  "/server/core/**",
  "/server/host/**",
  "/server/tooling/tsconfig.base.json",
  "/server/tooling/check-node.mjs",
  "/package.json",
  "/pnpm-lock.yaml",
  "/pnpm-workspace.yaml",
  "/.nvmrc",
];

/** Gitignore-style negations: docs and tests never trigger a deploy. Keep these last. */
const NEVER_WATCH = ["!**/*.md", "!**/*.test.ts"];

/** Fail the plan early, with a clear message, instead of deploying a service that can't start. */
function checkGame(game: Game): Game {
  const dir = new URL(`../${game.dir}/`, import.meta.url);
  const pkgFile = new URL("package.json", dir);
  if (!existsSync(pkgFile) || !existsSync(new URL("server.ts", dir))) {
    throw new Error(`Game "${game.service}": ${game.dir} needs a package.json and a server.ts.`);
  }
  const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as {
    name?: string;
    scripts?: Record<string, string>;
  };
  if (pkg.name !== game.package) {
    throw new Error(
      `Game "${game.service}": ${game.dir}/package.json is "${pkg.name}", not "${game.package}".`,
    );
  }
  if (!pkg.scripts?.build) throw new Error(`Game "${game.service}": ${game.package} has no "build" script.`);
  return game;
}

function gameService(game: Game, env: (typeof ENVIRONMENTS)[EnvironmentName]) {
  return service(game.service, {
    // Wait for CI: a commit deploys only after every GitHub check suite on it has passed.
    source: github(REPO, { branch: env.branch, checkSuites: true }),
    build: {
      builder: "RAILPACK",
      // Railpack runs `pnpm install --frozen-lockfile` first (dev dependencies included, so tsx is there).
      buildCommand: `pnpm --filter ${game.package} build`,
      watchPatterns: [`/${game.dir}/**`, ...PLATFORM_WATCH, ...NEVER_WATCH],
    },
    // Node runs the server directly (no pnpm in between), so Railway's SIGTERM reaches it and players
    // get the "Server restarting" notice before the rooms close.
    start: `node --import tsx ${game.dir}/server.ts`,
    healthcheck: "/health",
    healthcheckTimeout: 60,
    // Exactly one replica: rooms, room codes and replays live in this process's memory.
    replicas: { [REGION]: 1 },
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      // Railway's default is 0 s between SIGTERM and SIGKILL; give the rooms time to close cleanly.
      drainingSeconds: 15,
      // Never sleep: an idle service would drop every open WebSocket.
      sleepApplication: false,
    },
    env: {
      APP_ENV: env.appEnv,
      PORT,
      LOG_LEVEL: "info",
    },
  });
}

export default defineRailway((ctx) => {
  const name = ctx.environment ?? "";
  if (!Object.hasOwn(ENVIRONMENTS, name)) {
    throw new Error(
      `This file manages the environments ${Object.keys(ENVIRONMENTS).join(" and ")}, not "${name}". ` +
        "Link one of them with `railway link` or pass `--environment`.",
    );
  }
  const env = ENVIRONMENTS[name as EnvironmentName];
  return project(PROJECT, { resources: GAMES.map((game) => gameService(checkGame(game), env)) });
});
