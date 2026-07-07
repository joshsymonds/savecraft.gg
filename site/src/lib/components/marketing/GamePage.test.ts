/// <reference types="@testing-library/jest-dom/vitest" />
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import type { GameInfo } from "$lib/server/plugins";

import type { GamePageContent } from "./game-page";
import GamePage from "./GamePage.svelte";

afterEach(cleanup);

const game: GameInfo = {
  gameId: "testgame",
  sources: ["wasm"],
  name: "Test Game",
  description: "A test game.",
  channel: "beta",
  coverage: "full",
  limitations: [],
  iconHtml: "<svg></svg>",
  referenceModules: [
    { name: "rules_search", description: "Search the rules.", requires_save: false },
    { name: "save_audit", description: "Audit your save.", requires_save: true },
  ],
};

const theme = {
  accent: "#c8a84e",
  accentBright: "#e8c86e",
  onAccent: "#05071a",
  heroBackground: "linear-gradient(180deg, #0a0305 0%, #0a0e2e 100%)",
  particleSeed: 7,
  heroAccent: "gold" as const,
};

function fullContent(): GamePageContent {
  return {
    seo: {
      title: "Test Game with Claude & ChatGPT | Savecraft",
      metaDescription: "Real Test Game data for your AI.",
      ogTitle: "Savecraft -- Test Game",
      ogDescription: "Real Test Game data.",
      jsonDescription: "Real Test Game data for your AI.",
      path: "/testgame",
    },
    gameName: "Test Game",
    theme,
    hero: {
      eyebrow: "TEST EYEBROW",
      title: "The hero title.",
      subtitle: "The hero subtitle.",
      frames: [{ src: "/images/testgame/one.png", alt: "First frame" }],
      primaryCta: { label: "CONNECT NOW" },
      secondaryCta: { label: "SEE THE TOOLS", href: "#tools" },
    },
    proofItems: ["Source Alpha", "Source Beta"],
    sections: [
      {
        kind: "modules",
        id: "tools",
        eyebrow: "EXPERT MODULES",
        title: "Real data.",
        treatment: "tinted",
      },
      {
        kind: "compare",
        eyebrow: "THE DIFFERENCE",
        title: "What changes",
        treatment: "bleed",
        pairs: [
          {
            headerLabel: "TEST COMPARE",
            without: [{ role: "player", text: "Question?" }],
            withoutCaption: "Guesswork.",
            with: [{ role: "ai", text: "Grounded answer." }],
            withCaption: "Real data.",
          },
        ],
      },
      {
        kind: "modes",
        eyebrow: "HOW YOU USE IT",
        title: "Modes",
        cards: [
          {
            icon: "*",
            label: "TEST MODE",
            color: "var(--color-gold)",
            examples: [{ role: "ai", text: "Mode example text." }],
          },
        ],
      },
      {
        kind: "flow",
        eyebrow: "HOW IT WORKS",
        title: "Three steps",
        treatment: "tinted",
        steps: [{ title: "Install", desc: "Install the thing." }],
      },
      {
        kind: "methodGrid",
        eyebrow: "METHODOLOGY",
        title: "We show our work",
        items: [{ source: "Alpha Project", desc: "Alpha powers the answers." }],
      },
    ],
    cta: { title: "Give your AI the real data.", sub: "Works everywhere.", label: "CONNECT" },
  };
}

function minimalContent(): GamePageContent {
  const c = fullContent();
  return {
    ...c,
    hero: {
      eyebrow: "MINIMAL",
      title: "Demo-led hero.",
      subtitle: "No images exist for this game.",
      demo: {
        conversation: [{ role: "player", text: "Live demo question" }],
        headerLabel: "DEMO HEADER",
      },
      primaryCta: { label: "CONNECT NOW" },
    },
    sections: [
      {
        kind: "modules",
        eyebrow: "EXPERT MODULES",
        title: "Real data.",
      },
    ],
  };
}

describe("GamePage head", () => {
  it("emits title, description, canonical, and full social tags", () => {
    render(GamePage, { props: { content: fullContent(), game } });
    expect(document.title).toBe("Test Game with Claude & ChatGPT | Savecraft");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Real Test Game data for your AI.",
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://savecraft.gg/testgame",
    );
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(
      "Savecraft -- Test Game",
    );
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/testgame",
    );
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://savecraft.gg/og/testgame.png",
    );
    expect(document.head.querySelector('meta[name="twitter:title"]')?.getAttribute("content")).toBe(
      "Savecraft -- Test Game",
    );
    expect(
      document.head.querySelector('meta[name="twitter:description"]')?.getAttribute("content"),
    ).toBe("Real Test Game data.");
  });

  it("emits WebPage JSON-LD about the game", () => {
    render(GamePage, { props: { content: fullContent(), game } });
    const scripts = Array.from(
      document.head.querySelectorAll('script[type="application/ld+json"]'),
    );
    const webpage = scripts
      .map((s) => JSON.parse(s.textContent ?? "{}"))
      .find((d) => d["@type"] === "WebPage");
    expect(webpage).toBeDefined();
    expect(webpage.url).toBe("https://savecraft.gg/testgame");
    expect(webpage.about).toEqual({ "@type": "VideoGame", name: "Test Game" });
  });
});

describe("GamePage sections", () => {
  it("renders hero copy and CTAs", () => {
    render(GamePage, { props: { content: fullContent(), game } });
    expect(screen.getByRole("heading", { level: 1, name: "The hero title." })).toBeInTheDocument();
    expect(screen.getByText("TEST EYEBROW")).toBeInTheDocument();
    expect(screen.getByText("The hero subtitle.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CONNECT NOW" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SEE THE TOOLS" })).toHaveAttribute("href", "#tools");
  });

  it("renders every proof item", () => {
    render(GamePage, { props: { content: fullContent(), game } });
    expect(screen.getByText("Source Alpha")).toBeInTheDocument();
    expect(screen.getByText("Source Beta")).toBeInTheDocument();
  });

  it("renders one module card per reference module with badge state", () => {
    render(GamePage, { props: { content: fullContent(), game } });
    expect(screen.getByText("rules_search")).toBeInTheDocument();
    expect(screen.getByText("save_audit")).toBeInTheDocument();
    expect(screen.getByText("INSTANT")).toBeInTheDocument();
    expect(screen.getByText("NEEDS SAVE")).toBeInTheDocument();
  });

  it("renders compare, modes, flow, and methodGrid sections from content", () => {
    render(GamePage, { props: { content: fullContent(), game } });
    expect(screen.getByText("TEST COMPARE")).toBeInTheDocument();
    expect(screen.getByText("Guesswork.")).toBeInTheDocument();
    expect(screen.getByText("TEST MODE")).toBeInTheDocument();
    expect(screen.getByText("Install")).toBeInTheDocument();
    expect(screen.getByText("Alpha Project")).toBeInTheDocument();
  });

  it("renders the final CTA", () => {
    render(GamePage, { props: { content: fullContent(), game } });
    expect(screen.getByText("Give your AI the real data.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CONNECT" })).toBeInTheDocument();
  });

  it("uses at least three distinct section treatments on a full page", () => {
    const { container } = render(GamePage, { props: { content: fullContent(), game } });
    const treatments = new Set(
      Array.from(container.querySelectorAll("section[class*='treatment-']")).map(
        (el) => Array.from(el.classList).find((c) => c.startsWith("treatment-")) ?? "",
      ),
    );
    expect(treatments.size).toBeGreaterThanOrEqual(3);
  });
});

describe("GamePage minimal content", () => {
  it("renders a demo-led hero when no frames exist", () => {
    render(GamePage, { props: { content: minimalContent(), game } });
    expect(screen.getByRole("heading", { level: 1, name: "Demo-led hero." })).toBeInTheDocument();
    expect(screen.getByText("DEMO HEADER")).toBeInTheDocument();
  });

  it("omits compare, modes, and flow markup when content has none", () => {
    const { container } = render(GamePage, { props: { content: minimalContent(), game } });
    expect(container.querySelector(".compare-grid")).toBeNull();
    expect(container.querySelector(".modes-grid")).toBeNull();
    expect(container.querySelector(".flow-grid")).toBeNull();
    expect(screen.getByText("rules_search")).toBeInTheDocument();
  });
});
