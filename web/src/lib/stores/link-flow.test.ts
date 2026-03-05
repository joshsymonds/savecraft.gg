import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/api/client", () => ({
  linkSource: vi.fn(),
}));

const { linkSource } = await import("$lib/api/client");
const { pendingLinkCode } = await import("./link-code");
const {
  cancelLink,
  dismissLinkError,
  linkedSourceId,
  linkCode,
  linkError,
  linkState,
  resetLinkFlow,
  submitLinkCode,
} = await import("./link-flow");

describe("link-flow", () => {
  beforeEach(() => {
    vi.mocked(linkSource).mockReset();
    resetLinkFlow();
    pendingLinkCode.set(null);
  });

  it("starts in idle state", () => {
    expect(get(linkState)).toBe("idle");
    expect(get(linkError)).toBe("");
    expect(get(linkedSourceId)).toBe(null);
  });

  it("transitions to linking then success on API success", async () => {
    vi.mocked(linkSource).mockResolvedValue({ source_uuid: "dev-123" });

    const promise = submitLinkCode("482913");
    expect(get(linkState)).toBe("linking");

    await promise;

    expect(linkSource).toHaveBeenCalledWith("482913");
    expect(get(linkState)).toBe("success");
    expect(get(linkedSourceId)).toBe("dev-123");
  });

  it("clears pendingLinkCode immediately on submit", async () => {
    pendingLinkCode.set("482913");
    vi.mocked(linkSource).mockResolvedValue({ source_uuid: "dev-123" });

    const promise = submitLinkCode("482913");
    expect(get(pendingLinkCode)).toBe(null);

    await promise;
  });

  it("maps 400 status to invalid code message", async () => {
    const err = Object.assign(new Error("Invalid code"), { status: 400 });
    vi.mocked(linkSource).mockRejectedValue(err);

    await submitLinkCode("000000");

    expect(get(linkState)).toBe("error");
    expect(get(linkError)).toContain("Invalid code");
  });

  it("maps 404 status to expired code message", async () => {
    const err = Object.assign(new Error("Not found"), { status: 404 });
    vi.mocked(linkSource).mockRejectedValue(err);

    await submitLinkCode("000000");

    expect(get(linkState)).toBe("error");
    expect(get(linkError)).toContain("expired");
  });

  it("maps unknown error to network error message", async () => {
    vi.mocked(linkSource).mockRejectedValue(new TypeError("fetch failed"));

    await submitLinkCode("000000");

    expect(get(linkState)).toBe("error");
    expect(get(linkError)).toContain("Network error");
  });

  it("dismissLinkError resets to idle", async () => {
    const err = Object.assign(new Error("bad"), { status: 400 });
    vi.mocked(linkSource).mockRejectedValue(err);
    await submitLinkCode("000000");
    expect(get(linkState)).toBe("error");

    dismissLinkError();

    expect(get(linkState)).toBe("idle");
    expect(get(linkError)).toBe("");
  });

  it("resetLinkFlow clears linkedSourceId after success", async () => {
    vi.mocked(linkSource).mockResolvedValue({ source_uuid: "dev-456" });
    await submitLinkCode("482913");
    expect(get(linkedSourceId)).toBe("dev-456");

    resetLinkFlow();

    expect(get(linkState)).toBe("idle");
    expect(get(linkError)).toBe("");
    expect(get(linkedSourceId)).toBe(null);
  });

  it("exposes submitted code via linkCode store", async () => {
    vi.mocked(linkSource).mockResolvedValue({ source_uuid: "dev-123" });

    expect(get(linkCode)).toBe("");
    await submitLinkCode("482913");
    expect(get(linkCode)).toBe("482913");
  });

  it("cancelLink resets to idle from linking", () => {
    vi.mocked(linkSource).mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );
    void submitLinkCode("482913");
    expect(get(linkState)).toBe("linking");

    cancelLink();

    expect(get(linkState)).toBe("idle");
    expect(get(linkError)).toBe("");
    expect(get(linkCode)).toBe("");
  });

  it("ignores stale API result after cancelLink", async () => {
    let resolveLink: (v: { source_uuid: string }) => void;
    vi.mocked(linkSource).mockReturnValue(
      new Promise((resolve) => {
        resolveLink = resolve;
      }),
    );

    void submitLinkCode("482913");
    cancelLink();

    // Resolve the original promise — should be ignored
    resolveLink!({ source_uuid: "dev-stale" });
    await Promise.resolve();

    expect(get(linkState)).toBe("idle");
    expect(get(linkedSourceId)).toBe(null);
  });

  it("auto-resets to idle after success", async () => {
    vi.useFakeTimers();
    vi.mocked(linkSource).mockResolvedValue({ source_uuid: "dev-789" });

    await submitLinkCode("482913");
    expect(get(linkState)).toBe("success");
    expect(get(linkedSourceId)).toBe("dev-789");

    await vi.advanceTimersByTimeAsync(5000);

    expect(get(linkState)).toBe("idle");
    expect(get(linkedSourceId)).toBe(null);

    vi.useRealTimers();
  });
});
