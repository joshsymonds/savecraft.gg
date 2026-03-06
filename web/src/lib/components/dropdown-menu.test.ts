import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import DropdownMenu from "./DropdownMenu.svelte";

interface Option {
  id: string;
  label: string;
  sublabel?: string;
}

const defaultOptions: readonly Option[] = [
  { id: "opt-1", label: "Option One" },
  { id: "opt-2", label: "Option Two" },
];

function optionsWithSublabels(): readonly Option[] {
  return [
    { id: "opt-a", label: "Alpha", sublabel: "First letter" },
    { id: "opt-b", label: "Beta", sublabel: "Second letter" },
  ];
}

describe("DropdownMenu", () => {
  afterEach(cleanup);

  it("renders trigger button with label text", () => {
    render(DropdownMenu, {
      props: { label: "Add Source", options: [...defaultOptions], onpick: vi.fn() },
    });
    expect(screen.getByRole("button", { name: /Add Source/ })).toBeInTheDocument();
  });

  it("dropdown is closed by default", () => {
    render(DropdownMenu, {
      props: { label: "Add Source", options: [...defaultOptions], onpick: vi.fn() },
    });
    expect(screen.queryByText("Option One")).not.toBeInTheDocument();
    expect(screen.queryByText("Option Two")).not.toBeInTheDocument();
  });

  it("opens dropdown on click showing option labels", async () => {
    render(DropdownMenu, {
      props: { label: "Add Source", options: [...defaultOptions], onpick: vi.fn() },
    });
    await userEvent.click(screen.getByRole("button", { name: /Add Source/ }));
    expect(screen.getByText("Option One")).toBeInTheDocument();
    expect(screen.getByText("Option Two")).toBeInTheDocument();
  });

  it("shows sublabels when present", async () => {
    render(DropdownMenu, {
      props: { label: "Pick", options: [...optionsWithSublabels()], onpick: vi.fn() },
    });
    await userEvent.click(screen.getByRole("button", { name: /Pick/ }));
    expect(screen.getByText("First letter")).toBeInTheDocument();
    expect(screen.getByText("Second letter")).toBeInTheDocument();
  });

  it("calls onpick with the selected option and closes menu", async () => {
    const onpick = vi.fn();
    render(DropdownMenu, {
      props: { label: "Add", options: [...defaultOptions], onpick },
    });
    await userEvent.click(screen.getByRole("button", { name: /Add/ }));
    await userEvent.click(screen.getByText("Option One"));
    expect(onpick).toHaveBeenCalledExactlyOnceWith({ id: "opt-1", label: "Option One" });
    expect(screen.queryByText("Option One")).not.toBeInTheDocument();
  });

  it("shows 'No options available' for empty options", async () => {
    render(DropdownMenu, {
      props: { label: "Add", options: [], onpick: vi.fn() },
    });
    await userEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(screen.getByText("No options available")).toBeInTheDocument();
  });

  it("closes on Escape key", async () => {
    render(DropdownMenu, {
      props: { label: "Add", options: [...defaultOptions], onpick: vi.fn() },
    });
    await userEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(screen.getByText("Option One")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Option One")).not.toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    render(DropdownMenu, {
      props: { label: "Add", options: [...defaultOptions], onpick: vi.fn(), disabled: true },
    });
    await userEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(screen.queryByText("Option One")).not.toBeInTheDocument();
  });
});
