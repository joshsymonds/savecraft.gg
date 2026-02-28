import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
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
const mockGeneratePairingCode = vi.fn().mockResolvedValue({
  code: "123456",
});

vi.mock("$lib/api/client", () => ({
  listApiKeys: () => mockListApiKeys(),
  createApiKey: (label?: string) => mockCreateApiKey(label),
  deleteApiKey: (keyId: string) => mockDeleteApiKey(keyId),
  generatePairingCode: () => mockGeneratePairingCode(),
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

  describe("prominent mode — pairing flow", () => {
    it("renders GET STARTED heading", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("GET STARTED")).toBeInTheDocument();
    });

    it("renders PAIR A DEVICE button", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("PAIR A DEVICE")).toBeInTheDocument();
    });

    it("shows pairing code after clicking PAIR A DEVICE", async () => {
      render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("PAIR A DEVICE"));
      await vi.waitFor(() => {
        expect(screen.getByText("123 456")).toBeInTheDocument();
      });
    });

    it("shows countdown timer with code", async () => {
      render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("PAIR A DEVICE"));
      await vi.waitFor(() => {
        expect(screen.getByText("Expires in")).toBeInTheDocument();
      });
    });

    it("shows code hint after generating", async () => {
      render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("PAIR A DEVICE"));
      await vi.waitFor(() => {
        expect(
          screen.getByText("Enter this code when the installer prompts you."),
        ).toBeInTheDocument();
      });
    });

    it("shows expired state after countdown", async () => {
      vi.useFakeTimers();

      render(InstallBlock, { props: { prominent: true } });

      fireEvent.click(screen.getByText("PAIR A DEVICE"));

      // Flush promise microtasks to let the mock resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(screen.getByText("123 456")).toBeInTheDocument();

      // Advance past 2-minute TTL
      await vi.advanceTimersByTimeAsync(121_000);

      expect(screen.getByText("Code expired")).toBeInTheDocument();
      expect(screen.getByText("GET NEW CODE")).toBeInTheDocument();

      vi.useRealTimers();
    });

    it("shows error on generation failure", async () => {
      mockGeneratePairingCode.mockRejectedValueOnce(new Error("Network error"));

      render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("PAIR A DEVICE"));
      await vi.waitFor(() => {
        expect(screen.getByText("Network error")).toBeInTheDocument();
      });

      // Should return to idle state with button available
      expect(screen.getByText("PAIR A DEVICE")).toBeInTheDocument();
    });

    it("renders what happens next steps", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText(/systemd user service/)).toBeInTheDocument();
      expect(screen.getByText(/appears on this page/)).toBeInTheDocument();
    });

    it("renders step numbers", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const steps = container.querySelectorAll(".step-number");
      expect(steps).toHaveLength(3);
      expect(steps[0]!.textContent).toBe("1");
      expect(steps[1]!.textContent).toBe("2");
      expect(steps[2]!.textContent).toBe("3");
    });
  });

  describe("prominent mode — install command", () => {
    it("shows install command without API key", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const cmdText = container.querySelector(".command-text")!.textContent!;
      expect(cmdText).toContain("curl -sSL");
      expect(cmdText).toContain("SAVECRAFT_SERVER_URL=");
      expect(cmdText).not.toContain("SAVECRAFT_AUTH_TOKEN");
    });

    it("shows install hint about pairing code", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(
        screen.getByText("The installer will prompt you for the pairing code."),
      ).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders ADD ANOTHER DEVICE toggle", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.getByText("ADD ANOTHER DEVICE")).toBeInTheDocument();
    });

    it("does not show pairing content when collapsed", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.queryByText("PAIR A DEVICE")).not.toBeInTheDocument();
    });

    it("shows pairing flow when expanded", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.getByText("PAIR A DEVICE")).toBeInTheDocument();
    });

    it("collapses when toggle clicked again", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.getByText("PAIR A DEVICE")).toBeInTheDocument();

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.queryByText("PAIR A DEVICE")).not.toBeInTheDocument();
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
