import type { PickerGame } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import GamePickerModal from "./GamePickerModal.svelte";

function makeCatalog(): PickerGame[] {
  return [
    {
      gameId: "d2r",
      methods: ["daemon"],
      name: "Diablo II: Resurrected",
      description: "Parses .d2s character saves",
      watched: true,
      saveCount: 3,
    },
    {
      gameId: "sdv",
      methods: ["daemon"],
      name: "Stardew Valley",
      description: "Farm saves and skills",
      watched: false,
      saveCount: 0,
    },
    {
      gameId: "bg3",
      methods: ["daemon"],
      name: "Baldur's Gate 3",
      description: "Party and quest progress",
      watched: false,
      saveCount: 0,
    },
    {
      gameId: "rimworld",
      methods: ["mod"],
      name: "RimWorld",
      description: "In-game mod pushes full colony state on save",
      watched: false,
      saveCount: 0,
      workshopUrl: "https://steamcommunity.com/sharedfiles/filedetails/?id=3693580596",
    },
    {
      gameId: "wow",
      methods: ["adapter"],
      name: "World of Warcraft",
      description: "Character profiles via Battle.net API",
      watched: false,
      saveCount: 0,
      isApiGame: true,
      adapter: { authProvider: "battlenet", regions: ["us", "eu", "kr", "tw"] },
    },
    {
      gameId: "poe",
      methods: ["adapter"],
      name: "Path of Exile",
      description: "Character builds via GGG API",
      watched: false,
      saveCount: 0,
      isApiGame: true,
      adapter: { authProvider: "ggg", regions: ["pc"] },
    },
  ];
}

describe("GamePickerModal", () => {
  afterEach(cleanup);

  it("renders all games", () => {
    render(GamePickerModal, { props: { games: makeCatalog(), onclose: vi.fn() } });
    expect(screen.getByText("Diablo II: Resurrected")).toBeInTheDocument();
    expect(screen.getByText("Stardew Valley")).toBeInTheDocument();
    expect(screen.getByText("Baldur's Gate 3")).toBeInTheDocument();
  });

  it("renders ADD A GAME title", () => {
    render(GamePickerModal, { props: { games: makeCatalog(), onclose: vi.fn() } });
    expect(screen.getByText("ADD A GAME")).toBeInTheDocument();
  });

  it("filters games by search", async () => {
    render(GamePickerModal, { props: { games: makeCatalog(), onclose: vi.fn() } });
    const searchInput = screen.getByPlaceholderText("Search games...");
    await userEvent.type(searchInput, "stardew");
    expect(screen.getByText("Stardew Valley")).toBeInTheDocument();
    expect(screen.queryByText("Diablo II: Resurrected")).not.toBeInTheDocument();
    expect(screen.queryByText("Baldur's Gate 3")).not.toBeInTheDocument();
  });

  it("shows empty state when search has no matches", async () => {
    render(GamePickerModal, { props: { games: makeCatalog(), onclose: vi.fn() } });
    const searchInput = screen.getByPlaceholderText("Search games...");
    await userEvent.type(searchInput, "zzzzz");
    expect(screen.getByText(/No games matching/)).toBeInTheDocument();
  });

  it("calls onselect for watched game click", async () => {
    const onselect = vi.fn();
    render(GamePickerModal, { props: { games: makeCatalog(), onselect, onclose: vi.fn() } });
    await userEvent.click(screen.getByText("Diablo II: Resurrected"));
    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]![0]!.gameId).toBe("d2r");
  });

  it("does not call onselect for unwatched game click", async () => {
    const onselect = vi.fn();
    render(GamePickerModal, { props: { games: makeCatalog(), onselect, onclose: vi.fn() } });
    await userEvent.click(screen.getByText("Stardew Valley"));
    expect(onselect).not.toHaveBeenCalled();
  });

  it("calls onclose on close button click", async () => {
    const onclose = vi.fn();
    render(GamePickerModal, { props: { games: makeCatalog(), onclose } });
    await userEvent.click(screen.getByText("✕"));
    expect(onclose).toHaveBeenCalledOnce();
  });

  // -- Computer (source) selection step --

  const twoSources = [
    { id: "src-1", name: "Desktop", hostname: "desktop-pc", platform: "windows" },
    { id: "src-2", name: "Laptop", hostname: "laptop", platform: "linux" },
  ];

  const oneSource = [{ id: "src-1", name: "Desktop", hostname: "desktop-pc", platform: "windows" }];

  it("shows the computer hub when clicking an unwatched daemon game with sources", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    expect(screen.getByText("WHICH COMPUTER?")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
  });

  it("shows the computer hub even with a single source so pair-another stays reachable (#17)", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: oneSource, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    // No silent auto-jump to the config form: the hub (and its
    // pair-another leaf) is always the entry point for daemon games.
    expect(screen.getByText("WHICH COMPUTER?")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.getByText("Pair another computer")).toBeInTheDocument();
    expect(screen.queryByText(/CONNECT STARDEW VALLEY/)).not.toBeInTheDocument();
  });

  it("routes the pair-another leaf to the daemon setup step (#17)", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    await userEvent.click(screen.getByText("Pair another computer"));
    expect(screen.getByText("SET UP DAEMON")).toBeInTheDocument();
    expect(screen.getByText(/curl -sSL/)).toBeInTheDocument();
  });

  it("proceeds to config form after selecting a computer", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    await userEvent.click(screen.getByText("Desktop"));
    expect(screen.getByText(/CONNECT STARDEW VALLEY/)).toBeInTheDocument();
  });

  it("passes sourceId to onconfigure callback", async () => {
    const onconfigure = vi.fn().mockResolvedValue(null);
    render(GamePickerModal, {
      props: {
        games: makeCatalog(),
        configurableSources: oneSource,
        onconfigure,
        onclose: vi.fn(),
      },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    await userEvent.click(screen.getByText("Desktop"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "/saves/stardew");
    await userEvent.click(screen.getByText("Connect Game"));
    expect(onconfigure).toHaveBeenCalledWith("sdv", "/saves/stardew", "src-1");
  });

  it("clicking a daemon game with no paired daemon shows contextual setup (#17)", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: [], onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    // Unified picker: no error — the install + pair step appears inline.
    expect(screen.getByText("SET UP DAEMON")).toBeInTheDocument();
    expect(screen.getByText("Install", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Pair", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/curl -sSL/)).toBeInTheDocument();
    expect(screen.queryByText("ADD A GAME")).not.toBeInTheDocument();
  });

  it("pre-fills default path based on source platform, not browser OS", async () => {
    const gamesWithPaths: PickerGame[] = [
      {
        gameId: "sdv",
        methods: ["daemon"],
        name: "Stardew Valley",
        description: "Farm saves",
        watched: false,
        saveCount: 0,
        defaultPaths: {
          windows: String.raw`C:\Users\Josh\AppData\Roaming\StardewValley\Saves`,
          linux: "/home/josh/.config/StardewValley/Saves",
        },
      },
    ];
    const linuxSource = [
      { id: "src-1", name: "Steam Deck", hostname: "steamdeck", platform: "linux" },
    ];
    render(GamePickerModal, {
      props: { games: gamesWithPaths, configurableSources: linuxSource, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    await userEvent.click(screen.getByText("Steam Deck"));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- svelte-check needs this cast
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("/home/josh/.config/StardewValley/Saves");
  });

  it("back from the computer hub returns to game list", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Stardew Valley"));
    expect(screen.getByText("WHICH COMPUTER?")).toBeInTheDocument();
    await userEvent.click(screen.getByText("←"));
    expect(screen.getByText("ADD A GAME")).toBeInTheDocument();
  });

  // -- Adapter (OAuth) flow --

  it("shows region selection when clicking an unwatched adapter game", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: oneSource, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("World of Warcraft"));
    expect(screen.getByText("SELECT YOUR REGION")).toBeInTheDocument();
    expect(screen.getByText("Americas")).toBeInTheDocument();
    expect(screen.getByText("Europe")).toBeInTheDocument();
  });

  it("does not show the computer hub for adapter games even with multiple sources", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: twoSources, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("World of Warcraft"));
    expect(screen.queryByText("WHICH COMPUTER?")).not.toBeInTheDocument();
    expect(screen.getByText("SELECT YOUR REGION")).toBeInTheDocument();
  });

  it("calls onoauthconnect with gameId and region when region is selected", async () => {
    const onoauthconnect = vi.fn();
    render(GamePickerModal, {
      props: { games: makeCatalog(), onoauthconnect, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("World of Warcraft"));
    await userEvent.click(screen.getByText("Americas"));
    expect(onoauthconnect).toHaveBeenCalledWith("wow", "us");
  });

  it("auto-skips the region step for a single-region adapter game (#17)", async () => {
    const onoauthconnect = vi.fn();
    render(GamePickerModal, {
      props: { games: makeCatalog(), onoauthconnect, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("Path of Exile"));
    // One realm (PoE "pc"): a lone region button is noise, so connect directly.
    expect(screen.queryByText("SELECT YOUR REGION")).not.toBeInTheDocument();
    expect(onoauthconnect).toHaveBeenCalledWith("poe", "pc");
  });

  it("does not require configurable sources for adapter games", async () => {
    const onoauthconnect = vi.fn();
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: [], onoauthconnect, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("World of Warcraft"));
    expect(screen.queryByText(/No configurable source/)).not.toBeInTheDocument();
    expect(screen.getByText("SELECT YOUR REGION")).toBeInTheDocument();
  });

  it("back from region selection returns to game list", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("World of Warcraft"));
    expect(screen.getByText("SELECT YOUR REGION")).toBeInTheDocument();
    await userEvent.click(screen.getByText("←"));
    expect(screen.getByText("ADD A GAME")).toBeInTheDocument();
  });

  // -- Workshop mod flow --

  it("shows workshop install step when clicking unwatched workshop game", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("RimWorld"));
    expect(screen.getByText("INSTALL MOD")).toBeInTheDocument();
    expect(screen.getByText("Subscribe")).toBeInTheDocument();
    expect(screen.getByText("Enable & play")).toBeInTheDocument();
    expect(screen.getByText("Pair")).toBeInTheDocument();
  });

  it("workshop panel links to Steam Workshop URL", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("RimWorld"));
    const link = screen.getByText("Open Steam Workshop").closest("a")!;
    expect(link.href).toBe("https://steamcommunity.com/sharedfiles/filedetails/?id=3693580596");
    expect(link.target).toBe("_blank");
  });

  it("workshop panel shows mod settings hint", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("RimWorld"));
    expect(screen.getByText(/Mod Settings/)).toBeInTheDocument();
  });

  it("calls onpair when pairing code submitted in workshop flow", async () => {
    const onpair = vi.fn();
    const { container } = render(GamePickerModal, {
      props: { games: makeCatalog(), onpair, onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("RimWorld"));
    const input = container.querySelector<HTMLInputElement>(".hidden-input")!;
    await userEvent.type(input, "ABC123");
    expect(onpair).toHaveBeenCalledWith("ABC123");
  });

  it("does not require configurable sources for workshop games", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), configurableSources: [], onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("RimWorld"));
    expect(screen.queryByText(/No configurable source/)).not.toBeInTheDocument();
    expect(screen.getByText("INSTALL MOD")).toBeInTheDocument();
  });

  it("back from workshop install returns to game list", async () => {
    render(GamePickerModal, {
      props: { games: makeCatalog(), onclose: vi.fn() },
    });
    await userEvent.click(screen.getByText("RimWorld"));
    expect(screen.getByText("INSTALL MOD")).toBeInTheDocument();
    await userEvent.click(screen.getByText("←"));
    expect(screen.getByText("ADD A GAME")).toBeInTheDocument();
  });
});
