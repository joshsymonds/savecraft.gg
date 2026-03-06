import type { TestPathResult, ValidationState } from "$lib/types/source";
import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import SourceEditModal from "./SourceEditModal.svelte";

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    gameName: "diablo ii",
    gameId: "d2r",
    sourceId: "src-1",
    sourceName: "Desktop",
    onclose: vi.fn(),
    ...overrides,
  };
}

describe("SourceEditModal", () => {
  afterEach(cleanup);

  it("renders game name uppercased and source name in title", () => {
    render(SourceEditModal, { props: defaultProps() });
    expect(screen.getByText("DIABLO II")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
  });

  it("renders path input with initial path value", () => {
    render(SourceEditModal, {
      props: defaultProps({ initialPath: "/home/user/saves" }),
    });
    const input = screen.getByLabelText("SAVE DIRECTORY");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("/home/user/saves");
  });

  it("shows Checking... when validationState is checking", () => {
    render(SourceEditModal, {
      props: defaultProps({
        initialPath: "/some/path",
        validationState: "checking" satisfies ValidationState,
      }),
    });
    expect(screen.getByText("Checking...")).toBeInTheDocument();
  });

  it("shows file count and file names when validationState is valid", () => {
    const testPathResult: TestPathResult = {
      valid: true,
      filesFound: 3,
      fileNames: ["save1.d2s", "save2.d2s", "save3.d2s"],
    };
    render(SourceEditModal, {
      props: defaultProps({
        initialPath: "/some/path",
        validationState: "valid" satisfies ValidationState,
        testPathResult,
      }),
    });
    expect(screen.getByText(/3 files found/)).toBeInTheDocument();
    expect(screen.getByText("save1.d2s")).toBeInTheDocument();
    expect(screen.getByText("save2.d2s")).toBeInTheDocument();
    expect(screen.getByText("save3.d2s")).toBeInTheDocument();
  });

  it("shows +N more when more than 5 files", () => {
    const testPathResult: TestPathResult = {
      valid: true,
      filesFound: 8,
      fileNames: ["a.d2s", "b.d2s", "c.d2s", "d.d2s", "e.d2s", "f.d2s", "g.d2s", "h.d2s"],
    };
    render(SourceEditModal, {
      props: defaultProps({
        initialPath: "/some/path",
        validationState: "valid" satisfies ValidationState,
        testPathResult,
      }),
    });
    expect(screen.getByText(/8 files found/)).toBeInTheDocument();
    expect(screen.getByText("a.d2s")).toBeInTheDocument();
    expect(screen.getByText("e.d2s")).toBeInTheDocument();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
    expect(screen.queryByText("f.d2s")).not.toBeInTheDocument();
  });

  it("shows Directory not found when validationState is invalid", () => {
    render(SourceEditModal, {
      props: defaultProps({
        initialPath: "/bad/path",
        validationState: "invalid" satisfies ValidationState,
      }),
    });
    expect(screen.getByText(/Directory not found/)).toBeInTheDocument();
  });

  it("shows Validation failed when validationState is error", () => {
    render(SourceEditModal, {
      props: defaultProps({
        initialPath: "/bad/path",
        validationState: "error" satisfies ValidationState,
      }),
    });
    expect(screen.getByText(/Validation failed/)).toBeInTheDocument();
  });

  it("CONNECT button is disabled when path is empty", () => {
    render(SourceEditModal, { props: defaultProps() });
    const connectButton = screen.getByText("CONNECT");
    expect(connectButton).toBeDisabled();
  });

  it("shows CANCEL and CONNECT buttons", () => {
    render(SourceEditModal, { props: defaultProps() });
    expect(screen.getByText("CANCEL")).toBeInTheDocument();
    expect(screen.getByText("CONNECT")).toBeInTheDocument();
  });
});
