import { newSeed, SeededRandom } from "@sdm/core/shared";
import { type Client, Room } from "colyseus";
import { z } from "zod";
import ghostConfig from "../config/ghost.json" with { type: "json" };
import {
  actionSchema,
  type EscapeAction,
  type EscapeSnapshot,
  escapeRoomName,
  runSeconds,
  tickMs,
} from "../shared/escape.ts";

const ticksPerSecond = 1000 / tickMs;
const runTicks = runSeconds * ticksPerSecond;
const ghost = z
  .object({
    earliestGhostSeconds: z.number().int().positive(),
    latestGhostSeconds: z.number().int().lt(runSeconds),
    encounterSeconds: z.number().int().positive(),
    resistanceSeconds: z.literal(5),
  })
  .refine(
    (config) =>
      config.latestGhostSeconds >= config.earliestGhostSeconds &&
      config.encounterSeconds >= config.resistanceSeconds,
  )
  .parse(ghostConfig);
const resistanceTicks = ghost.resistanceSeconds * ticksPerSecond;
const encounterTicks = ghost.encounterSeconds * ticksPerSecond;
const photoYear = "1973";

export class EscapeRun {
  private readonly holding = new Set<string>();
  private ticksLeft = runTicks;
  private paperCode = "";
  private ghostAt = 0;
  private ghostTicks = 0;
  private survived = false;
  readonly state: EscapeSnapshot = {
    phase: "waiting",
    patients: [],
    attempt: 1,
    seconds: runSeconds,
    paper: null,
    inventory: [],
    paintingCut: false,
    cabinetOpen: false,
    year: null,
    ghostSeconds: null,
    message: "Waiting for two patients.",
  };

  constructor(private readonly random = new SeededRandom(newSeed())) {}

  private start() {
    const next = String(this.random.int(1000, 9999));
    this.paperCode = next === this.paperCode ? String(1000 + ((Number(next) - 999) % 9000)) : next;
    this.ghostAt = this.random.int(ghost.earliestGhostSeconds, ghost.latestGhostSeconds) * ticksPerSecond;
    this.ticksLeft = runTicks;
    this.ghostTicks = 0;
    this.survived = false;
    this.holding.clear();
    Object.assign(this.state, {
      phase: "running",
      seconds: runSeconds,
      paper: null,
      inventory: [],
      paintingCut: false,
      cabinetOpen: false,
      year: null,
      ghostSeconds: null,
      message: "Start with the paper marked 1 on the ward desk.",
    });
    for (const patient of this.state.patients) {
      patient.station = null;
      patient.resistance = 0;
    }
  }

  join(id: string) {
    const slot = this.state.patients.some((patient) => patient.slot === 1) ? 2 : 1;
    this.state.patients.push({ id, slot, station: null, resistance: 0 });
    if (this.state.patients.length === 2 && this.state.phase === "waiting") this.start();
  }

  leave(id: string) {
    this.state.patients = this.state.patients.filter((patient) => patient.id !== id);
    this.holding.delete(id);
    if (this.state.phase === "running")
      this.state.message = "Your partner vanished. The clock is still running.";
  }

  private summonGhost() {
    this.ghostTicks = encounterTicks;
    this.state.ghostSeconds = encounterTicks / ticksPerSecond;
    this.holding.clear();
    this.state.message = "A ghost blocks the ward. Both players must hold E for five seconds.";
  }

  private fail(message: string) {
    this.state.phase = "failed";
    this.state.ghostSeconds = null;
    this.holding.clear();
    this.state.message = message;
  }

  tick() {
    if (this.state.phase !== "running") return false;
    this.ticksLeft -= 1;
    const previous = this.state.seconds;
    this.state.seconds = Math.ceil(this.ticksLeft / ticksPerSecond);
    if (this.ticksLeft === 0) {
      this.fail("Time ran out. Restart together to try again.");
      return true;
    }
    if (this.ghostTicks > 0) {
      this.ghostTicks -= 1;
      this.state.ghostSeconds = Math.ceil(this.ghostTicks / ticksPerSecond);
      for (const patient of this.state.patients) {
        if (patient.resistance === resistanceTicks) continue;
        patient.resistance = this.holding.has(patient.id)
          ? Math.min(patient.resistance + 1, resistanceTicks)
          : 0;
      }
      if (
        this.state.patients.length === 2 &&
        this.state.patients.every((patient) => patient.resistance === resistanceTicks)
      ) {
        this.survived = true;
        this.ghostTicks = 0;
        this.holding.clear();
        this.state.ghostSeconds = null;
        this.state.message = "The ghost recedes. Keep looking for the exit.";
      } else if (this.ghostTicks === 0) {
        this.fail("The ghost caught you. Restart together to try again.");
      }
      return true;
    }
    if (!this.survived && runTicks - this.ticksLeft >= this.ghostAt) {
      this.summonGhost();
      return true;
    }
    return this.state.seconds !== previous;
  }

  act(id: string, action: EscapeAction) {
    const patient = this.state.patients.find((entry) => entry.id === id);
    if (!patient) return;
    if (action.type === "restart") {
      if (
        this.state.patients.length === 2 &&
        (this.state.phase === "failed" || this.state.phase === "escaped")
      ) {
        this.state.attempt += 1;
        this.start();
      }
      return;
    }
    if (this.state.phase !== "running") return;
    if (action.type === "ward-off") {
      if (this.ghostTicks === 0) return;
      if (action.pressed) this.holding.add(id);
      else {
        this.holding.delete(id);
        if (patient.resistance < resistanceTicks) patient.resistance = 0;
      }
      return;
    }
    if (this.ghostTicks > 0) return;

    switch (action.type) {
      case "move":
        patient.station = action.station;
        break;
      case "inspect":
        patient.station = action.station;
        if (action.station === "note") this.state.paper = this.paperCode;
        break;
      case "collect": {
        const reachable =
          action.item === "knife"
            ? patient.station === "desk"
            : patient.station === "painting" && this.state.paintingCut && !this.state.cabinetOpen;
        if (!reachable || this.state.inventory.includes(action.item)) return;
        this.state.inventory.push(action.item);
        this.state.message =
          action.item === "knife"
            ? "Knife added to the shared inventory."
            : "Key added to the shared inventory.";
        break;
      }
      case "use":
        if (!this.state.inventory.includes(action.item)) return;
        if (action.item === "knife" && patient.station === "painting") {
          this.state.paintingCut = true;
          this.state.message = "The canvas tears. A key is tucked behind it.";
        } else if (action.item === "key" && patient.station === "cabinet") {
          this.state.inventory = this.state.inventory.filter((item) => item !== "key");
          this.state.cabinetOpen = true;
          this.state.message = "The medicine cabinet opens. Read the note inside.";
        }
        break;
      case "code":
        if (patient.station === "photo" && this.state.cabinetOpen && this.state.paper) {
          if (action.code === this.paperCode) {
            this.state.year = photoYear;
            this.state.message = "The photograph opens. Its year is now in the drawer.";
          } else this.state.message = "The photograph lock rejects the code.";
        } else if (patient.station === "exit" && this.state.year) {
          if (action.code !== this.state.year) this.state.message = "The exit lock rejects the year.";
          else if (this.state.patients.length !== 2)
            this.state.message = "Both players must be connected to escape.";
          else if (!this.survived) this.summonGhost();
          else {
            this.state.phase = "escaped";
            this.state.message = "The lock clicks. Both patients are free.";
          }
        }
        break;
    }
  }
}

class EscapeRoom extends Room {
  override maxClients = 2;
  private readonly run = new EscapeRun();

  override onCreate() {
    this.onMessage("sync", (client) => client.send("snapshot", this.run.state));
    this.onMessage("action", (client, input: unknown) => {
      const action = actionSchema.safeParse(input);
      if (!action.success) return;
      this.run.act(client.sessionId, action.data);
      this.broadcast("snapshot", this.run.state);
    });
    this.clock.setInterval(() => {
      if (this.run.tick()) this.broadcast("snapshot", this.run.state);
    }, tickMs);
  }

  override onJoin(client: Client) {
    this.run.join(client.sessionId);
    this.broadcast("snapshot", this.run.state);
  }

  override onLeave(client: Client) {
    this.run.leave(client.sessionId);
    this.broadcast("snapshot", this.run.state);
  }
}

export const rooms = { [escapeRoomName]: () => EscapeRoom };
