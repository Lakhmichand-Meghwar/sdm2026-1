import { describe, expect, it } from "vitest";
import { inviteLink } from "./invite.ts";

describe("inviteLink", () => {
  it("swaps localhost for the network address and keeps the port", () => {
    expect(inviteLink("http://localhost:5173/", "KNFZ", "192.168.1.127")).toBe(
      "http://192.168.1.127:5173/?room=KNFZ",
    );
  });

  it("also swaps 127.0.0.1", () => {
    expect(inviteLink("http://127.0.0.1:5173/", "KNFZ", "10.0.0.8")).toBe("http://10.0.0.8:5173/?room=KNFZ");
  });

  it("leaves an address another laptop can already reach", () => {
    expect(inviteLink("http://192.168.1.50:5173/", "KNFZ", "192.168.1.127")).toBe(
      "http://192.168.1.50:5173/?room=KNFZ",
    );
    expect(inviteLink("https://game.example.com/", "KNFZ", null)).toBe("https://game.example.com/?room=KNFZ");
  });

  it("falls back to the address in the browser when there is no network address", () => {
    expect(inviteLink("http://localhost:5173/", "KNFZ", null)).toBe("http://localhost:5173/?room=KNFZ");
  });

  it("drops an old room code, query and hash from the page address", () => {
    expect(inviteLink("http://localhost:5173/?room=AAAA&debug#x", "KNFZ", "192.168.1.127")).toBe(
      "http://192.168.1.127:5173/?room=KNFZ",
    );
  });
});
