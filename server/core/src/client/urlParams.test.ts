import { describe, expect, it } from "vitest";
import { buildInviteLink, normalizeRoomCode, readClientParams } from "./urlParams.ts";

describe("normalizeRoomCode", () => {
  it("uppercases and trims a valid code", () => {
    expect(normalizeRoomCode(" qxtr ")).toBe("QXTR");
  });

  it("rejects codes with the wrong length or characters", () => {
    expect(normalizeRoomCode("QXT")).toBeNull();
    expect(normalizeRoomCode("QXTRA")).toBeNull();
    expect(normalizeRoomCode("QX1R")).toBeNull();
    expect(normalizeRoomCode("")).toBeNull();
  });
});

describe("readClientParams", () => {
  it("reads room, name, scenario and debug", () => {
    expect(readClientParams("?room=qxtr&name=Ada&scenario=crowded&debug=1")).toEqual({
      room: "QXTR",
      name: "Ada",
      scenario: "crowded",
      debug: true,
    });
  });

  it("returns nulls and debug off when nothing is set", () => {
    expect(readClientParams("")).toEqual({ room: null, name: null, scenario: null, debug: false });
  });

  it("ignores an invalid room code and empty values", () => {
    expect(readClientParams("?room=nope!&name=&scenario=")).toEqual({
      room: null,
      name: null,
      scenario: null,
      debug: false,
    });
  });

  it("treats debug without a value, or true, as on, and 0 or false as off", () => {
    expect(readClientParams("?debug").debug).toBe(true);
    expect(readClientParams("?debug=true").debug).toBe(true);
    expect(readClientParams("?debug=0").debug).toBe(false);
    expect(readClientParams("?debug=false").debug).toBe(false);
  });

  it("trims and limits the player name", () => {
    expect(readClientParams(`?name=${"x".repeat(40)}`).name).toHaveLength(24);
    expect(readClientParams("?name=%20Ada%20").name).toBe("Ada");
  });
});

describe("buildInviteLink", () => {
  it("keeps the page and replaces only the room", () => {
    expect(buildInviteLink("https://game.example/play?room=AAAA&name=Ada#top", "QXTR")).toBe(
      "https://game.example/play?room=QXTR",
    );
  });
});
