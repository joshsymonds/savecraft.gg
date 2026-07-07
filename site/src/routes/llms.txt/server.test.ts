import { describe, it, expect } from "vitest";
import { discoverPlugins } from "$lib/server/plugins";
import { GET } from "./+server";

describe("GET /llms.txt", () => {
  it("titles the document Savecraft", async () => {
    const res = GET();
    const body = await res.text();
    expect(body).toMatch(/^# Savecraft/);
  });

  it("lists one entry per game from the real plugin manifests", async () => {
    const res = GET();
    const body = await res.text();
    const games = discoverPlugins();
    expect(games.length).toBeGreaterThan(0);

    for (const game of games) {
      expect(body).toContain(`- [${game.name}](https://savecraft.gg/${game.gameId}): ${game.description}`);
    }

    const gameLines = body.split("\n").filter((line) => line.startsWith("- ["));
    expect(gameLines).toHaveLength(games.length);
  });

  it("serves plain text content type", () => {
    const res = GET();
    expect(res.headers.get("content-type")).toContain("text/plain");
  });
});
