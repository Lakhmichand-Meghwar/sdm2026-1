import { buildInviteLink } from "@sdm/core/client";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

let networkAddress: string | null = null;

/**
 * The link a player sends to their partner. A link that starts with localhost only opens on the
 * same computer, so when the game is opened that way the computer's network address replaces it.
 */
export function inviteLink(href: string, code: string, address: string | null): string {
  const url = new URL(buildInviteLink(href, code));
  if (address && LOOPBACK.has(url.hostname)) url.hostname = address;
  return url.toString();
}

export function currentInviteLink(code: string): string {
  return inviteLink(location.href, code, networkAddress);
}

/** In development, ask the dev server for the computer's network address. Deployed games don't need it. */
export async function loadNetworkAddress(): Promise<void> {
  if (!import.meta.env.DEV || !LOOPBACK.has(location.hostname)) return;
  try {
    const res = await fetch("/__lan");
    networkAddress = ((await res.json()) as { address: string | null }).address;
  } catch {
    // No address found: the link keeps using the address the page was opened with.
  }
}
