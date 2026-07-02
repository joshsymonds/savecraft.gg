import { activityEvents, resetActivity } from "$lib/stores/activity";
import { setPlugins } from "$lib/stores/plugins";
import { resetSources } from "$lib/stores/sources";
import { cleanup, render, screen } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_API_URL: "https://api.test",
  PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
  PUBLIC_MCP_URL: "https://mcp.test",
}));

const pageModule = await import("./+page.svelte");
const Page = pageModule.default;

function setLocation(search: string): void {
  globalThis.history.pushState({}, "", `/${search}`);
}

describe("/ dashboard OAuth redirect handling", () => {
  beforeEach(() => {
    resetActivity();
    resetSources();
    setPlugins({
      poe: {
        game_id: "poe",
        name: "Path of Exile",
        description: "",
        version: "1",
        file_extensions: null,
        default_paths: {},
        coverage: "",
      },
      poe2: {
        game_id: "poe2",
        name: "Path of Exile 2",
        description: "",
        version: "1",
        file_extensions: null,
        default_paths: {},
        coverage: "",
      },
      wow: {
        game_id: "wow",
        name: "World of Warcraft",
        description: "",
        version: "1",
        file_extensions: null,
        default_paths: {},
        coverage: "",
      },
    });
  });

  afterEach(() => {
    cleanup();
    globalThis.history.pushState({}, "", "/");
  });

  it("names every successfully-connected game when game_id carries more than one (#22)", () => {
    setLocation("?connected=true&game_id=poe,poe2");

    render(Page);

    const event = get(activityEvents)[0];
    expect(event?.type).toBe("oauth_connected");
    expect(event?.message).toBe("Path of Exile and Path of Exile 2 connected");
    expect(screen.getByText("Path of Exile and Path of Exile 2 connected")).toBeInTheDocument();
  });

  it("still names a single connected game when game_id carries one (unaffected single-game providers)", () => {
    setLocation("?connected=true&game_id=wow");

    render(Page);

    const event = get(activityEvents)[0];
    expect(event?.type).toBe("oauth_connected");
    expect(event?.message).toBe("World of Warcraft connected");
  });
});
