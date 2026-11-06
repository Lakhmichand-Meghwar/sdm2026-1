# Ward 04

Two players on separate computers share one three-minute countdown. Investigate the ward, collect clues, and open the exit together. The inventory drawer shares tools and clues during an attempt. Start with the burnt paper at station 1 and investigate the desk. Both players must hold E for five continuous seconds when the ghost appears. At 00:00 both players lose, and either can restart for both once two players are connected. Restart clears clues and items.

## Play on a local network

From the repository root, run `pnpm install --frozen-lockfile` and then:

```powershell
pnpm --filter @team-2/game build
pnpm --filter @team-2/game start
```

Both players open `http://<host-LAN-IP>:2567` in their browsers. On the host computer, `http://localhost:2567` works too. The host must allow inbound connections on port 2567. One player creates a room and shares the code. The clock starts when the second player joins.

For frontend development on the host computer, run `pnpm --filter @team-2/game dev` and open `http://localhost:5173`.

Use keys 1?6 or Left/Right to select stations and move your character. Press E to inspect, or click a station directly. Press Escape to close a clue.
