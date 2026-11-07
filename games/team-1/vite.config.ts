import { networkInterfaces } from "node:os";
import { defineConfig, type Plugin } from "vite";

const PRIVATE_NETWORK = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** This computer's address on the local network, if it has one. Prefers a home or office address. */
function findNetworkAddress(): string | null {
  const found: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const entry of addresses ?? []) {
      if (entry.family === "IPv4" && !entry.internal) found.push(entry.address);
    }
  }
  return found.find((address) => PRIVATE_NETWORK.test(address)) ?? found[0] ?? null;
}

/** Dev only: tells the page the network address, so the invite link opens on another laptop. */
function networkAddress(): Plugin {
  return {
    name: "network-address",
    configureServer(server) {
      server.middlewares.use("/__lan", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ address: findNetworkAddress() }));
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths: the same build works at the root of its own server and under /team-1/ behind the gateway.
  base: "./",
  plugins: [networkAddress()],
  server: { port: 5173, strictPort: true, host: true },
  build: { outDir: "dist", emptyOutDir: true },
});
