import { type Client, Room } from "colyseus";
import {
  actionSchema,
  type EscapeAction,
  type EscapeClue,
  type EscapeSnapshot,
  escapeRoomName,
  loopSeconds,
  tickMs,
} from "../shared/escape.ts";

const ticksPerSecond = 1000 / tickMs;
const loopTicks = loopSeconds * ticksPerSecond;

class EscapeLoop {
  private readonly notebook = new Set<EscapeClue>();
  private ticksLeft = loopTicks;
  private contactTicks = 0;
  private knocks = 0;
  readonly state: EscapeSnapshot = {
    phase: "waiting",
    players: 0,
    loop: 1,
    seconds: loopSeconds,
    clues: [],
    hasKey: false,
    cabinetOpen: false,
    terminalUnlocked: false,
    exitContact: null,
    message: "The ward is waiting for two patients.",
  };

  join() {
    this.state.players += 1;
    if (this.state.players === 2 && this.state.phase === "waiting") {
      this.state.phase = "running";
      this.state.message = "The door locks. Something behind the wall starts counting.";
    }
  }

  leave(sessionId: string) {
    this.state.players -= 1;
    if (this.state.exitContact === sessionId) this.state.exitContact = null;
    if (this.state.phase === "running") {
      this.state.phase = "waiting";
      this.state.message = "Your partner vanished. The clock waits for another patient.";
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
      this.ticksLeft = loopTicks;
      this.knocks = 0;
      this.state.loop += 1;
      this.state.hasKey = false;
      this.state.cabinetOpen = false;
      this.state.terminalUnlocked = false;
      this.state.exitContact = null;
      this.state.message = "The ward has reset. Your notebook is still warm.";
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
    if (this.state.phase !== "running") return;
    if (action.type === "password") {
      if (!this.state.cabinetOpen) this.state.message = "The terminal is unpowered. Check the cabinet.";
      else if (action.code !== "1973") this.state.message = "ACCESS DENIED. Something knocks back.";
      else {
        this.state.terminalUnlocked = true;
        this.remember("terminal");
        this.state.message = "The exit contacts light up. Both patients must touch the door.";
      }
      return;
    }
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
  private readonly loop = new EscapeLoop();

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

  override onJoin() {
    this.loop.join();
    this.broadcast("snapshot", this.loop.state);
  }

  override onLeave(client: Client) {
    this.loop.leave(client.sessionId);
    this.broadcast("snapshot", this.loop.state);
  }
}

export const rooms = { [escapeRoomName]: EscapeRoom };
