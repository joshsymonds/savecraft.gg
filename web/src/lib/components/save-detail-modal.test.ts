import type { NoteSummary, Save } from "$lib/types/source";
import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import SaveDetailModal from "./SaveDetailModal.svelte";

function makeSave(overrides: Partial<Save> = {}): Save {
  return {
    saveUuid: "s1",
    saveName: "Hammerdin",
    summary: "Paladin · Level 89",
    lastUpdated: "2m ago",
    status: "success",
    sourceId: "src-1",
    sourceName: "STEAM-DECK",
    ...overrides,
  };
}

function makeNotes(): NoteSummary[] {
  return [
    {
      id: "n1",
      title: "Build notes",
      content: "20 points in Blessed Hammer",
      source: "user",
      sizeBytes: 32,
      updatedAt: "1h ago",
    },
    {
      id: "n2",
      title: "Gear list",
      content: "Enigma, HOTO, Spirit",
      source: "user",
      sizeBytes: 24,
      updatedAt: "2d ago",
    },
  ];
}

describe("SaveDetailModal", () => {
  afterEach(cleanup);

  it("calls loadNotes on mount and renders returned notes", async () => {
    const loadNotes = vi.fn().mockResolvedValue(makeNotes());
    render(SaveDetailModal, {
      props: {
        save: makeSave(),
        onclose: vi.fn(),
        loadNotes,
      },
    });
    expect(loadNotes).toHaveBeenCalledExactlyOnceWith("s1");
    await waitFor(() => {
      expect(screen.getByText("Build notes")).toBeInTheDocument();
      expect(screen.getByText("Gear list")).toBeInTheDocument();
    });
  });

  it("shows empty state when loadNotes returns empty", async () => {
    const loadNotes = vi.fn().mockResolvedValue([]);
    render(SaveDetailModal, {
      props: {
        save: makeSave(),
        onclose: vi.fn(),
        loadNotes,
      },
    });
    await waitFor(() => {
      expect(screen.getByText("No notes yet")).toBeInTheDocument();
    });
  });

  it("shows NEW NOTE button when onnotecreate is provided", async () => {
    const loadNotes = vi.fn().mockResolvedValue([]);
    render(SaveDetailModal, {
      props: {
        save: makeSave(),
        onclose: vi.fn(),
        loadNotes,
        onnotecreate: vi.fn(),
      },
    });
    await waitFor(() => {
      expect(screen.getByText("NEW NOTE")).toBeInTheDocument();
    });
  });

  it("opens note creation form and calls onnotecreate", async () => {
    const loadNotes = vi.fn().mockResolvedValue([]);
    const onnotecreate = vi.fn().mockResolvedValue(null);
    render(SaveDetailModal, {
      props: {
        save: makeSave(),
        onclose: vi.fn(),
        loadNotes,
        onnotecreate,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("NEW NOTE")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("NEW NOTE"));
    expect(screen.getByPlaceholderText("Note title...")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Note title..."), "My note");
    await userEvent.type(screen.getByPlaceholderText("Note content..."), "Some content");
    await userEvent.click(screen.getByText("SAVE"));

    await waitFor(() => {
      expect(onnotecreate).toHaveBeenCalledExactlyOnceWith("s1", "My note", "Some content");
    });
  });
});
