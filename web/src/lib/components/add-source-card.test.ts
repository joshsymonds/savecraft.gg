import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AddSourceCard from "./AddSourceCard.svelte";

describe("AddSourceCard", () => {
  afterEach(cleanup);

  it("renders the + icon", () => {
    render(AddSourceCard);
    expect(screen.getByText("+")).toBeInTheDocument();
  });

  it("renders ADD SOURCE label", () => {
    render(AddSourceCard);
    expect(screen.getByText("ADD SOURCE")).toBeInTheDocument();
  });

  it("is a button element", () => {
    const { container } = render(AddSourceCard);
    expect(container.querySelector("button.add-source-card")).toBeInTheDocument();
  });

  it("calls onclick when clicked", async () => {
    const onclick = vi.fn();
    render(AddSourceCard, { props: { onclick } });
    await userEvent.click(screen.getByText("ADD SOURCE"));
    expect(onclick).toHaveBeenCalledOnce();
  });
});
