import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/api/client", () => ({
  linkDevice: vi.fn(),
}));

const { linkDevice } = await import("$lib/api/client");
const { pendingLinkCode } = await import("./link-code");
const { dismissLinkError, linkedDeviceId, linkError, linkState, resetLinkFlow, submitLinkCode } =
  await import("./link-flow");

describe("link-flow", () => {
  beforeEach(() => {
    vi.mocked(linkDevice).mockReset();
    resetLinkFlow();
    pendingLinkCode.set(null);
  });

  it("starts in idle state", () => {
    expect(get(linkState)).toBe("idle");
    expect(get(linkError)).toBe("");
    expect(get(linkedDeviceId)).toBe(null);
  });

  it("transitions to linking then success on API success", async () => {
    vi.mocked(linkDevice).mockResolvedValue({ device_uuid: "dev-123" });

    const promise = submitLinkCode("482913");
    expect(get(linkState)).toBe("linking");

    await promise;

    expect(linkDevice).toHaveBeenCalledWith("482913");
    expect(get(linkState)).toBe("success");
    expect(get(linkedDeviceId)).toBe("dev-123");
  });

  it("clears pendingLinkCode immediately on submit", async () => {
    pendingLinkCode.set("482913");
    vi.mocked(linkDevice).mockResolvedValue({ device_uuid: "dev-123" });

    const promise = submitLinkCode("482913");
    expect(get(pendingLinkCode)).toBe(null);

    await promise;
  });

  it("maps 400 status to invalid code message", async () => {
    const err = Object.assign(new Error("Invalid code"), { status: 400 });
    vi.mocked(linkDevice).mockRejectedValue(err);

    await submitLinkCode("000000");

    expect(get(linkState)).toBe("error");
    expect(get(linkError)).toContain("Invalid code");
  });

  it("maps 404 status to expired code message", async () => {
    const err = Object.assign(new Error("Not found"), { status: 404 });
    vi.mocked(linkDevice).mockRejectedValue(err);

    await submitLinkCode("000000");

    expect(get(linkState)).toBe("error");
    expect(get(linkError)).toContain("expired");
  });

  it("maps unknown error to network error message", async () => {
    vi.mocked(linkDevice).mockRejectedValue(new TypeError("fetch failed"));

    await submitLinkCode("000000");

    expect(get(linkState)).toBe("error");
    expect(get(linkError)).toContain("Network error");
  });

  it("dismissLinkError resets to idle", async () => {
    const err = Object.assign(new Error("bad"), { status: 400 });
    vi.mocked(linkDevice).mockRejectedValue(err);
    await submitLinkCode("000000");
    expect(get(linkState)).toBe("error");

    dismissLinkError();

    expect(get(linkState)).toBe("idle");
    expect(get(linkError)).toBe("");
  });

  it("resetLinkFlow clears linkedDeviceId after success", async () => {
    vi.mocked(linkDevice).mockResolvedValue({ device_uuid: "dev-456" });
    await submitLinkCode("482913");
    expect(get(linkedDeviceId)).toBe("dev-456");

    resetLinkFlow();

    expect(get(linkState)).toBe("idle");
    expect(get(linkError)).toBe("");
    expect(get(linkedDeviceId)).toBe(null);
  });
});
