# Ward 04

Two players on separate computers share one 60-second countdown. Investigate the ward, collect clues, and open the exit together. The shared notebook survives every reset.

## Play on a local network

From the repository root, run `pnpm install --frozen-lockfile` and then:

```powershell
pnpm --filter @team-2/game build
pnpm --filter @team-2/game start
```

Both players open `http://<host-LAN-IP>:2567` in their browsers. On the host computer, `http://localhost:2567` works too. The host must allow inbound connections on port 2567. One player creates a room and shares the code. The clock starts when the second player joins.

For frontend development on the host computer, run `pnpm --filter @team-2/game dev` and open `http://localhost:5173`.
