/**
 * URL parameters every game understands:
 * `?room=QXTR` join a room by code, `?name=Ada` player name,
 * `?scenario=crowded` load a QA scenario, `?debug` open the debug overlay at start.
 */

/** Room codes are four letters. Keep in sync with the server's room codes (#12). */
const ROOM_CODE_PATTERN = /^[A-Z]{4}$/;
export const MAX_NAME_LENGTH = 24;
const DEBUG_OFF_VALUES = ["0", "false", "off"];

export interface ClientParams {
  readonly room: string | null;
  readonly name: string | null;
  readonly scenario: string | null;
  readonly debug: boolean;
}

/** Returns the code in upper case, or null if it is not a valid room code. */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function readClientParams(search: string): ClientParams {
  const params = new URLSearchParams(search);
  const room = params.get("room");
  const debug = params.get("debug");
  return {
    room: room === null ? null : normalizeRoomCode(room),
    name: nonEmpty(params.get("name"))?.slice(0, MAX_NAME_LENGTH) ?? null,
    scenario: nonEmpty(params.get("scenario")),
    debug: debug !== null && !DEBUG_OFF_VALUES.includes(debug.toLowerCase()),
  };
}

/** The current page's URL with only `?room=<code>`: the link players share. */
export function buildInviteLink(currentHref: string, code: string): string {
  const url = new URL(currentHref);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", code);
  return url.toString();
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
