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

const mockDetectOS = vi.fn<() => string>().mockReturnValue("linux");
vi.mock("$lib/platform", () => ({
  detectOS: () => mockDetectOS(),
}));

describe("InstallBlock", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockListApiKeys.mockResolvedValue([]);
  });

  describe("prominent mode — install flow", () => {
    it("renders GET STARTED heading", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("GET STARTED")).toBeInTheDocument();
    });

    it("renders what happens next steps", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText(/systemd service/)).toBeInTheDocument();
      expect(screen.getByText(/appears on this page/i)).toBeInTheDocument();
    });

    it("renders step numbers", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const steps = container.querySelectorAll(".step-number");
      expect(steps).toHaveLength(2);
      expect(steps[0]!.textContent).toBe("1");
      expect(steps[1]!.textContent).toBe("2");
    });
  });

  describe("prominent mode — install command (Linux)", () => {
    it("shows install command", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const cmdText = container.querySelector(".command-text")!.textContent!;
      expect(cmdText).toContain("curl -sSL");
      expect(cmdText).toContain("install.savecraft.gg");
    });

    it("shows install hint about linking", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(
        screen.getByText("The installer shows a link to connect your device."),
      ).toBeInTheDocument();
    });

    it("does not show Windows download button", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.queryByText("DOWNLOAD FOR WINDOWS")).not.toBeInTheDocument();
    });
  });

  describe("prominent mode — install command (Windows)", () => {
    beforeEach(() => {
      mockDetectOS.mockReturnValue("windows");
    });

    afterEach(() => {
      mockDetectOS.mockReturnValue("linux");
    });

    it("shows download button instead of curl command", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("DOWNLOAD FOR WINDOWS")).toBeInTheDocument();
      expect(container.querySelector(".command-text")).toBeNull();
    });

    it("download button links to MSI", () => {
      render(InstallBlock, { props: { prominent: true } });
      const link = screen.getByText("DOWNLOAD FOR WINDOWS").closest("a");
      expect(link).not.toBeNull();
      expect(link!.href).toContain("install.savecraft.gg/daemon/");
      expect(link!.href).toMatch(/\.msi$/);
    });

    it("shows Windows-specific next steps", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText(/Program Files/)).toBeInTheDocument();
      expect(screen.getByText(/Starts on login/)).toBeInTheDocument();
    });

    it("shows Windows-specific install hint", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText(/follow the link in the system tray/i)).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders ADD ANOTHER DEVICE toggle", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.getByText("ADD ANOTHER DEVICE")).toBeInTheDocument();
    });

    it("does not show install content when collapsed", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.queryByText("Install Daemon")).not.toBeInTheDocument();
    });

    it("shows install flow when expanded", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.getByText("Install Daemon")).toBeInTheDocument();
    });

    it("collapses when toggle clicked again", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.getByText("Install Daemon")).toBeInTheDocument();

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.queryByText("Install Daemon")).not.toBeInTheDocument();
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
