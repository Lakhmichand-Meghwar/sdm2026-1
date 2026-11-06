import { type Client, Room } from "colyseus";
import {
  actionSchema,
  type EscapeAction,
  type EscapeClue,
  type EscapeSnapshot,
  escapeRoomName,
  runSeconds,
  tickMs,
} from "../shared/escape.ts";

const ticksPerSecond = 1000 / tickMs;
const runTicks = runSeconds * ticksPerSecond;

export class EscapeRun {
  private readonly notebook = new Set<EscapeClue>();
  private ticksLeft = runTicks;
  private contactTicks = 0;
  private knocks = 0;
  readonly state: EscapeSnapshot = {
    phase: "waiting",
    players: 0,
    attempt: 1,
    patients: [],
    seconds: runSeconds,
    clues: [],
    hasKey: false,
    cabinetOpen: false,
    terminalUnlocked: false,
    exitContact: null,
    message: "The ward is waiting for two patients.",
  };

  join(sessionId: string) {
    const slot = this.state.patients.some((patient) => patient.slot === 1) ? 2 : 1;
    this.state.patients.push({ id: sessionId, slot, station: null });
    this.state.players = this.state.patients.length;
    if (this.state.players === 2 && this.state.phase === "waiting") {
      this.state.phase = "running";
      this.state.message = "The door locks. Something behind the wall starts counting.";
    }
  }

  leave(sessionId: string) {
    this.state.patients = this.state.patients.filter((patient) => patient.id !== sessionId);
    this.state.players = this.state.patients.length;
    if (this.state.exitContact === sessionId) this.state.exitContact = null;
    if (this.state.phase === "running") {
      this.state.message = "Your partner vanished. The clock is still running.";
    }
  }

  tick() {
    if (this.state.phase !== "running") return false;
    if (this.state.exitContact && --this.contactTicks === 0) {
      this.state.exitContact = null;
      this.state.message = "The contact went cold. Try the door together again.";
      this.updateTimer();
      return true;
    }
    return this.updateTimer();
  }

  private updateTimer() {
    this.ticksLeft -= 1;
    if (this.ticksLeft === 0) {
      this.state.phase = "failed";
      this.state.exitContact = null;
      this.state.message = "The ward has sealed. Restart to make another attempt.";
    }
    const seconds = Math.ceil(this.ticksLeft / ticksPerSecond);
    if (seconds === this.state.seconds) return false;
    this.state.seconds = seconds;
    return true;
  }

  private remember(clue: EscapeClue) {
    this.notebook.add(clue);
    this.state.clues = [...this.notebook];
  }

  act(sessionId: string, action: EscapeAction) {
    if (action.type === "restart") {
      if (this.state.players !== 2 || (this.state.phase !== "failed" && this.state.phase !== "escaped"))
        return;
      this.notebook.clear();
      this.knocks = 0;
      this.contactTicks = 0;
      this.ticksLeft = runTicks;
      Object.assign(this.state, {
        phase: "running",
        attempt: this.state.attempt + 1,
        seconds: runSeconds,
        clues: [],
        hasKey: false,
        cabinetOpen: false,
        terminalUnlocked: false,
        exitContact: null,
        message: "The ward opens its eyes again.",
      });
      for (const patient of this.state.patients) patient.station = null;
      return;
    }
    if (this.state.phase !== "running") return;
    const patient = this.state.patients.find((entry) => entry.id === sessionId);
    if (!patient) return;
    if (action.type === "move") {
      patient.station = action.station;
      return;
    }
    if (action.type === "password") {
      patient.station = "terminal";
      if (!this.state.cabinetOpen) this.state.message = "The terminal is unpowered. Check the cabinet.";
      else if (action.code !== "1973") this.state.message = "ACCESS DENIED. Something knocks back.";
      else {
        this.state.terminalUnlocked = true;
        this.remember("terminal");
        this.state.message = "The exit contacts light up. Both patients must touch the door.";
      }
      return;
    }
    patient.station = action.target;
    switch (action.target) {
      case "note":
        this.remember("note");
        this.state.message = "A note in blue ink. You add it to the notebook.";
        break;
      case "photo":
        this.remember("photo");
        this.state.message = "You record the date. Someone in the photo has your face.";
        break;
      case "painting":
        if (this.state.cabinetOpen) this.state.message = "The niche behind the painting is empty.";
        else if (this.state.hasKey || ++this.knocks === 4) {
          this.state.hasKey = true;
          this.state.message = "The frame shifts. You take the rusted key.";
        } else this.state.message = "The frame shudders. It sounds hollow.";
        break;
      case "cabinet":
        if (!this.state.cabinetOpen && !this.state.hasKey) {
          this.state.message = "Locked. There is a cable running from it to the terminal.";
          break;
        }
        this.state.hasKey = false;
        this.state.cabinetOpen = true;
        this.remember("cabinet");
        this.state.message = "You flip the power switch and find a note inside.";
        break;
      case "exit":
        if (!this.state.terminalUnlocked) this.state.message = "Two dead contacts. The exit is sealed.";
        else if (this.state.exitContact === null) {
          this.state.exitContact = sessionId;
          this.contactTicks = 4 * ticksPerSecond;
          this.state.message = "One contact is live. The other player has four seconds to touch the door.";
        } else if (this.state.exitContact !== sessionId) {
          this.state.phase = "escaped";
          this.state.exitContact = null;
          this.state.message = "The door opens. For the first time, the ticking stops.";
        }
        break;
    }
  }
}

class EscapeRoom extends Room {
  override maxClients = 2;
  private readonly loop = new EscapeRun();

  override onCreate() {
    this.onMessage("sync", (client) => client.send("snapshot", this.loop.state));
    this.onMessage("action", (client, input: unknown) => {
      const action = actionSchema.safeParse(input);
      if (!action.success) return;
      this.loop.act(client.sessionId, action.data);
      this.broadcast("snapshot", this.loop.state);
    });
    this.clock.setInterval(() => {
      if (this.loop.tick()) this.broadcast("snapshot", this.loop.state);
    }, tickMs);
  }

  override onJoin(client: Client) {
    this.loop.join(client.sessionId);
    this.broadcast("snapshot", this.loop.state);
  }

  override onLeave(client: Client) {
    this.loop.leave(client.sessionId);
    this.broadcast("snapshot", this.loop.state);
  }
}

export const rooms = { [escapeRoomName]: EscapeRoom };
