# Team 1

This folder holds Team 1's work. Follow the workflow in [AGENTS.md](../../AGENTS.md); issues and pull requests for this folder carry the `team-1` label.

## Time Loop Escape

A two-player cooperative room escape. Each detective plays on their own device, in the same room, against a clock that resets the room. Three rooms (the Office, the Archive, the Vault) get shorter and harder. What you learn carries over.

Each detective can only use some of the things in a room. What you read goes in your own journal, and the other player only learns it when you tell them (the "Tell partner" button, or just say it). The briefing before each room lists what each of you does. Things you can't use are dimmed on your screen.

### Run it

You need Node 22.21.1 and pnpm (see [server/CLAUDE.md](../../server/CLAUDE.md)).

```
pnpm install
pnpm --filter @team-1/game dev
```

This starts the game server on port 2567 and the client on port 5173.

- **Same computer:** open http://localhost:5173 in two browser windows, create a room in one, and join with the 4-letter code in the other.
- **Two devices on the same network:** open `http://<your-computer-ip>:5173` on both. The client talks to the server on the same host, port 2567.

### Playing alone

In the lobby, press **Play alone**. You are the only detective: everything in every room is yours to use, there is no partner and no "Tell partner", and the keypad in the Archive takes the whole code (month, then day). The clock only needs you. If somebody joins the room by its code, the room becomes a two-player room and you each get your own jobs from then on.

### Where things are

| Path | What it holds |
|---|---|
| `shared/rules.ts` | Levels, clues, codes, puzzle answers and who owns each object (`OWNER`) |
| `shared/index.ts` | Room state, inputs and config schema |
| `shared/game.ts` | The rules: one deterministic `step` for both players |
| `config/game.json` | Timers, penalties and tuning values |
| `room/`, `server.ts` | The Colyseus room and server entry |
| `client/` | Lobby, intro, room scenes and HUD |

The server owns the game. A device only sends what its player did (click an object, submit a code, press ready), and draws whatever state the server sends back. In the debug console, `level 2` jumps to a room.
