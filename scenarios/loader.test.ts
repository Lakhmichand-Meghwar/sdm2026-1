import { describe, expect, it } from "vitest";
import { parseScenario } from "./loader.ts";
import basicScenario from "./samples/01-basic.json";

describe("parseScenario", () => {
  it("should successfully parse a valid sample scenario", () => {
    const result = parseScenario(basicScenario);
    expect(result.id).toBe("scenario-01");
    expect(result.players.length).toBe(2);
  });

  it("should throw an error if required fields are missing", () => {
    const invalidData = {
      id: "bad-scenario",
      name: "Missing Players",
      description: "This should fail",
      // missing the players array
    };
    expect(() => parseScenario(invalidData)).toThrow();
  });

  it("should throw an error if player coordinates are the wrong type", () => {
    const badPlayerData = {
      ...basicScenario,
      players: [
        { id: "player1", x: "abc", y: 10, role: "admin" }, // x is a string instead of number
      ],
    };
    expect(() => parseScenario(badPlayerData)).toThrow();
  });
});
