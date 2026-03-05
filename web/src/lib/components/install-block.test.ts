import { cleanup, render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InstallBlock from "./InstallBlock.svelte";

const mockListApiKeys = vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]);
const mockCreateApiKey = vi.fn().mockResolvedValue({
  id: "key-1",
  key: "sk_test_abc123",
  prefix: "sk_test",
  label: "daemon",
});
const mockDeleteApiKey = vi.fn((_keyId: string) => Promise.resolve());

vi.mock("$lib/api/client", () => ({
  listApiKeys: () => mockListApiKeys(),
  createApiKey: (label?: string) => mockCreateApiKey(label),
  deleteApiKey: (keyId: string) => mockDeleteApiKey(keyId),
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_API_URL: "https://api.test.savecraft.gg",
}));

describe("InstallBlock", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockListApiKeys.mockResolvedValue([]);
  });

  describe("prominent mode — install + pairing flow", () => {
    it("renders GET STARTED heading", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("GET STARTED")).toBeInTheDocument();
    });

    it("renders step 1 (Install) and step 2 (Enter Pairing Code)", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("Install")).toBeInTheDocument();
      expect(screen.getByText("Enter Pairing Code")).toBeInTheDocument();
    });

    it("renders step numbers", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const steps = container.querySelectorAll(".step-number");
      expect(steps).toHaveLength(2);
      expect(steps[0]!.textContent).toBe("1");
      expect(steps[1]!.textContent).toBe("2");
    });

    it("renders pairing code input with PAIR button", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const input = container.querySelector(".code-input") as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.maxLength).toBe(6);
      expect(screen.getByText("PAIR")).toBeInTheDocument();
    });

    it("PAIR button is disabled until 6 characters entered", async () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const pairBtn = screen.getByText("PAIR");
      expect(pairBtn).toBeDisabled();

      const input = container.querySelector(".code-input") as HTMLInputElement;
      await userEvent.type(input, "482913");
      expect(pairBtn).not.toBeDisabled();
    });

    it("calls onsubmit when PAIR clicked with valid code", async () => {
      const onsubmit = vi.fn();
      const { container } = render(InstallBlock, { props: { prominent: true, onsubmit } });

      const input = container.querySelector(".code-input") as HTMLInputElement;
      await userEvent.type(input, "482913");
      await userEvent.click(screen.getByText("PAIR"));

      expect(onsubmit).toHaveBeenCalledWith("482913");
    });

    it("calls onsubmit when Enter pressed with valid code", async () => {
      const onsubmit = vi.fn();
      const { container } = render(InstallBlock, { props: { prominent: true, onsubmit } });

      const input = container.querySelector(".code-input") as HTMLInputElement;
      await userEvent.type(input, "482913{Enter}");

      expect(onsubmit).toHaveBeenCalledWith("482913");
    });

    it("clears input after successful submit", async () => {
      const onsubmit = vi.fn();
      const { container } = render(InstallBlock, { props: { prominent: true, onsubmit } });

      const input = container.querySelector(".code-input") as HTMLInputElement;
      await userEvent.type(input, "482913{Enter}");

      expect(input.value).toBe("");
    });
  });

  describe("prominent mode — install commands (both platforms)", () => {
    it("shows Windows download button", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("DOWNLOAD FOR WINDOWS")).toBeInTheDocument();
    });

    it("download button links to MSI", () => {
      render(InstallBlock, { props: { prominent: true } });
      const link = screen.getByText("DOWNLOAD FOR WINDOWS").closest("a");
      expect(link).not.toBeNull();
      expect(link!.href).toContain("install.savecraft.gg/daemon/");
      expect(link!.href).toMatch(/\.msi$/);
    });

    it("shows Linux curl command", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const cmdText = container.querySelector(".command-text")!.textContent!;
      expect(cmdText).toContain("curl -sSL");
      expect(cmdText).toContain("install.savecraft.gg");
    });

    it("shows platform labels", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("WINDOWS")).toBeInTheDocument();
      expect(screen.getByText("LINUX / STEAM DECK")).toBeInTheDocument();
    });

    it("shows install hints for both platforms", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText(/Program Files/)).toBeInTheDocument();
      expect(screen.getByText(/systemd service/)).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders ADD ANOTHER SOURCE toggle", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.getByText("ADD ANOTHER SOURCE")).toBeInTheDocument();
    });

    it("does not show install content when collapsed", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.queryByText("Install")).not.toBeInTheDocument();
    });

    it("shows install and pairing sections when expanded", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER SOURCE"));
      expect(screen.getByText("Install")).toBeInTheDocument();
      expect(screen.getByText("Enter Pairing Code")).toBeInTheDocument();
    });

    it("collapses when toggle clicked again", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER SOURCE"));
      expect(screen.getByText("Install")).toBeInTheDocument();

      await userEvent.click(screen.getByText("ADD ANOTHER SOURCE"));
      expect(screen.queryByText("Install")).not.toBeInTheDocument();
    });
  });

  describe("API keys section", () => {
    it("shows API KEYS toggle", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("API KEYS (FOR AUTOMATION)")).toBeInTheDocument();
    });

    it("hides API key content by default", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.queryByText("GENERATE KEY")).not.toBeInTheDocument();
    });

    it("shows GENERATE KEY when API keys section expanded", async () => {
      render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("API KEYS (FOR AUTOMATION)"));
      expect(screen.getByText("GENERATE KEY")).toBeInTheDocument();
    });

    it("shows existing keys when present", async () => {
      mockListApiKeys.mockResolvedValueOnce([
        { id: "k1", prefix: "sk_abc", label: "daemon", created_at: "2025-01-01T00:00:00Z" },
      ]);

      render(InstallBlock, { props: { prominent: true } });

      // Expand API keys section
      await userEvent.click(screen.getByText("API KEYS (FOR AUTOMATION)"));

      await vi.waitFor(() => {
        expect(screen.getByText("sk_abc...")).toBeInTheDocument();
      });
      expect(screen.getByText("REVOKE")).toBeInTheDocument();
    });

    it("generates API key when GENERATE KEY clicked", async () => {
      render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("API KEYS (FOR AUTOMATION)"));
      await userEvent.click(screen.getByText("GENERATE KEY"));

      await vi.waitFor(() => {
        expect(screen.getByText("sk_test_abc123")).toBeInTheDocument();
      });
      expect(screen.getByText(/won't be shown again/)).toBeInTheDocument();
    });
  });
});
