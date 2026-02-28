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

  describe("prominent mode", () => {
    it("renders GET STARTED heading", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("GET STARTED")).toBeInTheDocument();
    });

    it("renders step numbers", () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });
      const steps = container.querySelectorAll(".step-number");
      expect(steps).toHaveLength(3);
      expect(steps[0]!.textContent).toBe("1");
      expect(steps[1]!.textContent).toBe("2");
      expect(steps[2]!.textContent).toBe("3");
    });

    it("renders GENERATE KEY button", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText("GENERATE KEY")).toBeInTheDocument();
    });

    it("shows key and install command after generating", async () => {
      const { container } = render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("GENERATE KEY"));
      await vi.waitFor(() => {
        expect(container.querySelector(".key-value")).toBeInTheDocument();
      });

      expect(container.querySelector(".key-value")!.textContent).toBe("sk_test_abc123");
      expect(container.querySelector(".command-text")!.textContent).toContain("curl -sSL");
      expect(container.querySelector(".command-text")!.textContent).toContain("sk_test_abc123");
    });

    it("shows key warning after generating", async () => {
      render(InstallBlock, { props: { prominent: true } });

      await userEvent.click(screen.getByText("GENERATE KEY"));
      await vi.waitFor(() => {
        expect(screen.getByText(/won't be shown again/)).toBeInTheDocument();
      });
    });

    it("renders what happens next steps", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText(/systemd user service/)).toBeInTheDocument();
      expect(screen.getByText(/appears on this page/)).toBeInTheDocument();
    });

    it("shows disabled message before key generation", () => {
      render(InstallBlock, { props: { prominent: true } });
      expect(screen.getByText(/Generate an API key first/)).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders ADD ANOTHER DEVICE toggle", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.getByText("ADD ANOTHER DEVICE")).toBeInTheDocument();
    });

    it("does not show install content when collapsed", () => {
      render(InstallBlock, { props: { prominent: false } });
      expect(screen.queryByText("GENERATE KEY")).not.toBeInTheDocument();
    });

    it("shows install content when expanded", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.getByText("GENERATE KEY")).toBeInTheDocument();
    });

    it("collapses when toggle clicked again", async () => {
      render(InstallBlock, { props: { prominent: false } });

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.getByText("GENERATE KEY")).toBeInTheDocument();

      await userEvent.click(screen.getByText("ADD ANOTHER DEVICE"));
      expect(screen.queryByText("GENERATE KEY")).not.toBeInTheDocument();
    });
  });

  describe("existing keys", () => {
    it("shows existing keys when present", async () => {
      mockListApiKeys.mockResolvedValueOnce([
        { id: "k1", prefix: "sk_abc", label: "daemon", created_at: "2025-01-01T00:00:00Z" },
      ]);

      render(InstallBlock, { props: { prominent: true } });

      await vi.waitFor(() => {
        expect(screen.getByText("sk_abc...")).toBeInTheDocument();
      });
      expect(screen.getByText("REVOKE")).toBeInTheDocument();
    });
  });
});
