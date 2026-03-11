import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AddSourceContent from "./AddSourceContent.svelte";

vi.mock("$env/static/public", () => ({
  PUBLIC_API_URL: "https://api.test.savecraft.gg",
}));

describe("AddSourceContent", () => {
  afterEach(cleanup);

  describe("install instructions", () => {
    it("renders step 1 (Install) and step 2 (Enter Pairing Code)", () => {
      render(AddSourceContent);
      expect(screen.getByText("Install")).toBeInTheDocument();
      expect(screen.getByText("Enter Pairing Code")).toBeInTheDocument();
    });

    it("renders step numbers", () => {
      const { container } = render(AddSourceContent);
      const steps = container.querySelectorAll(".step-number");
      expect(steps).toHaveLength(2);
      expect(steps[0]!.textContent).toBe("1");
      expect(steps[1]!.textContent).toBe("2");
    });

    it("shows Windows download button linking to install worker", () => {
      render(AddSourceContent);
      expect(screen.getByText("DOWNLOAD FOR WINDOWS")).toBeInTheDocument();
      const link = screen.getByText("DOWNLOAD FOR WINDOWS").closest("a");
      expect(link).not.toBeNull();
      expect(link!.href).toContain("install.savecraft.gg");
    });

    it("shows Linux curl command", () => {
      const { container } = render(AddSourceContent);
      const cmdText = container.querySelector(".command-text")!.textContent!;
      expect(cmdText).toContain("curl -sSL");
      expect(cmdText).toContain("install.savecraft.gg");
    });

    it("shows platform labels", () => {
      render(AddSourceContent);
      expect(screen.getByText("WINDOWS")).toBeInTheDocument();
      expect(screen.getByText("LINUX / STEAM DECK")).toBeInTheDocument();
    });

    it("shows install hints for both platforms", () => {
      render(AddSourceContent);
      expect(screen.getByText(/Run the downloaded installer/)).toBeInTheDocument();
      expect(screen.getByText(/systemd service/)).toBeInTheDocument();
    });
  });

  describe("pairing code input", () => {
    it("renders pairing code input with PAIR button", () => {
      const { container } = render(AddSourceContent);
      const input = container.querySelector<HTMLInputElement>(".code-input")!;
      expect(input).not.toBeNull();
      expect(input.maxLength).toBe(6);
      expect(screen.getByText("PAIR")).toBeInTheDocument();
    });

    it("PAIR button is disabled until 6 characters entered", async () => {
      const { container } = render(AddSourceContent);
      const pairButton = screen.getByText("PAIR");
      expect(pairButton).toBeDisabled();

      const input = container.querySelector<HTMLInputElement>(".code-input")!;
      await userEvent.type(input, "482913");
      expect(pairButton).not.toBeDisabled();
    });

    it("calls onsubmit when PAIR clicked with valid code", async () => {
      const onsubmit = vi.fn();
      const { container } = render(AddSourceContent, { props: { onsubmit } });

      const input = container.querySelector<HTMLInputElement>(".code-input")!;
      await userEvent.type(input, "482913");
      await userEvent.click(screen.getByText("PAIR"));

      expect(onsubmit).toHaveBeenCalledWith("482913");
    });

    it("calls onsubmit when Enter pressed with valid code", async () => {
      const onsubmit = vi.fn();
      const { container } = render(AddSourceContent, { props: { onsubmit } });

      const input = container.querySelector<HTMLInputElement>(".code-input")!;
      await userEvent.type(input, "482913{Enter}");

      expect(onsubmit).toHaveBeenCalledWith("482913");
    });

    it("clears input after successful submit", async () => {
      const onsubmit = vi.fn();
      const { container } = render(AddSourceContent, { props: { onsubmit } });

      const input = container.querySelector<HTMLInputElement>(".code-input")!;
      await userEvent.type(input, "482913{Enter}");

      expect(input.value).toBe("");
    });

    it("does not call onsubmit with fewer than 6 characters", async () => {
      const onsubmit = vi.fn();
      const { container } = render(AddSourceContent, { props: { onsubmit } });

      const input = container.querySelector<HTMLInputElement>(".code-input")!;
      await userEvent.type(input, "482{Enter}");

      expect(onsubmit).not.toHaveBeenCalled();
    });
  });
});
