import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import PlayAdvisor from "../../../../plugins/mtga/reference/views/play-advisor.svelte";

afterEach(cleanup);

describe("PlayAdvisor view", () => {
  it("renders game review findings", () => {
    const { container } = render(PlayAdvisor, {
      props: {
        data: {
          findings: [
            { turn: 3, category: "sequencing", description: "Should have played land before creature", impact: 2 },
            { turn: 5, category: "attack", description: "Missed lethal attack", impact: 5 },
          ],
          total_findings: 2,
          coverage: { found: 8, total: 10 },
        },
      },
    });
    expect(container.textContent).toContain("Turn 3");
    expect(container.textContent).toContain("Missed lethal");
  });

  it("renders mulligan advice", () => {
    const { container } = render(PlayAdvisor, {
      props: {
        data: {
          hand_size: 7,
          land_count: 3,
          cmc_bucket: "2-3",
          on_play: true,
          keep_win_rate: 58.2,
          keep_games: 15000,
          mulligan_win_rate: 51.0,
          mulligan_games: 8000,
          recommendation: "keep",
          margin_pp: 7.2,
        },
      },
    });
    expect(container.textContent).toContain("keep");
    expect(container.textContent).toContain("58.2");
  });

  it("renders card timing data", () => {
    const { container } = render(PlayAdvisor, {
      props: {
        data: {
          cards: [
            {
              card_name: "Sheoldred",
              best_turn: 4,
              best_win_rate: 68.5,
              turns: [
                { turn: 3, times_deployed: 100, win_rate: 62.0, total_games: 500 },
                { turn: 4, times_deployed: 300, win_rate: 68.5, total_games: 500 },
              ],
            },
          ],
          coverage: { found: 1, total: 1 },
        },
      },
    });
    expect(container.textContent).toContain("Sheoldred");
    expect(container.textContent).toContain("68.5");
  });
});
