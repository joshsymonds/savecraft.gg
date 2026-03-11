import type { AuthState } from "$lib/auth/clerk";
import { cleanup, render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGoto = vi.fn();
const mockInitializeClerk = vi.fn();
const mockLoadPlugins = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockResetSources = vi.fn();
const mockResetActivity = vi.fn();
const mockGetClerk = vi.fn(() => ({
  mountUserButton: vi.fn(),
  unmountUserButton: vi.fn(),
}));
const mockHandleMessage = vi.fn();

const authStore = writable<AuthState>({
  isLoaded: false,
  isSignedIn: false,
  user: null,
  sessionId: null,
});

let mockPathname = "/";

vi.mock("$app/navigation", () => ({
  goto: (...args: unknown[]) => mockGoto(...args),
}));

vi.mock("$app/state", () => ({
  page: {
    get url() {
      return new URL(`https://app.savecraft.gg${mockPathname}`);
    },
    get params() {
      return {};
    },
  },
  updated: { current: false },
}));

vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("$app/paths", () => ({
  resolve: (path: string) => path,
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_API_URL: "https://api.test",
  PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
}));

vi.mock("$lib/auth/clerk", () => ({
  authState: { subscribe: authStore.subscribe },
  initializeClerk: () => mockInitializeClerk(),
  getClerk: () => mockGetClerk(),
}));

vi.mock("$lib/stores/plugins", () => ({
  loadPlugins: () => mockLoadPlugins(),
}));

vi.mock("$lib/stores/sources", () => ({
  resetSources: () => mockResetSources(),
}));

vi.mock("$lib/stores/activity", () => ({
  resetActivity: () => mockResetActivity(),
}));

vi.mock("$lib/ws/client", () => ({
  connect: (...args: unknown[]) => mockConnect(...args),
  disconnect: () => mockDisconnect(),
}));

vi.mock("$lib/ws/dispatch", () => ({
  handleMessage: mockHandleMessage,
}));

vi.mock("$lib/components/UpdateBanner.svelte", () => ({
  default: {},
}));

const layoutModule = await import("./+layout.svelte");
const Layout = layoutModule.default;

const children = createRawSnippet(() => ({
  render: () => "<div data-testid='child'>child content</div>",
}));

function renderLayout() {
  return render(Layout, { props: { children } });
}

describe("layout route guard", () => {
  beforeEach(() => {
    mockGoto.mockReset();
    mockPathname = "/";
    // Clear session cookie
    document.cookie = "__client_uat=0; path=/";
    authStore.set({
      isLoaded: false,
      isSignedIn: false,
      user: null,
      sessionId: null,
    });
  });

  afterEach(cleanup);

  describe("public route prefix matching", () => {
    it("does not redirect on /sign-in", () => {
      mockPathname = "/sign-in";
      renderLayout();
      expect(mockGoto).not.toHaveBeenCalled();
    });

    it("does not redirect on /sign-in/factor-one", () => {
      mockPathname = "/sign-in/factor-one";
      renderLayout();
      expect(mockGoto).not.toHaveBeenCalled();
    });

    it("does not redirect on /sign-in/factor-two", () => {
      mockPathname = "/sign-in/factor-two";
      renderLayout();
      expect(mockGoto).not.toHaveBeenCalled();
    });
  });

  describe("unauthenticated redirect", () => {
    it("redirects / to /sign-in without redirect_url", () => {
      mockPathname = "/";
      renderLayout();
      expect(mockGoto).toHaveBeenCalledWith("/sign-in");
    });

    it("redirects non-root protected route with redirect_url", () => {
      mockPathname = "/link/abc123";
      renderLayout();
      expect(mockGoto).toHaveBeenCalledWith("/sign-in?redirect_url=%2Flink%2Fabc123");
    });

    it("redirects when Clerk confirms signed out", async () => {
      mockPathname = "/";
      // Simulate having a stale cookie so the pre-Clerk check doesn't redirect
      document.cookie = "__client_uat=1234567890; path=/";
      renderLayout();
      // No redirect yet — cookie suggests signed in
      expect(mockGoto).not.toHaveBeenCalled();

      // Clerk loads and confirms not signed in
      authStore.set({
        isLoaded: true,
        isSignedIn: false,
        user: null,
        sessionId: null,
      });
      await vi.waitFor(() => {
        expect(mockGoto).toHaveBeenCalledWith("/sign-in");
      });
    });
  });

  describe("authenticated state", () => {
    it("does not redirect when signed in", () => {
      document.cookie = "__client_uat=1234567890; path=/";
      authStore.set({
        isLoaded: true,
        isSignedIn: true,
        user: { id: "user_1", firstName: "Test", imageUrl: "" },
        sessionId: "sess_1",
      });
      mockPathname = "/";
      renderLayout();
      expect(mockGoto).not.toHaveBeenCalled();
    });

    it("renders app shell when signed in", () => {
      document.cookie = "__client_uat=1234567890; path=/";
      authStore.set({
        isLoaded: true,
        isSignedIn: true,
        user: { id: "user_1", firstName: "Test", imageUrl: "" },
        sessionId: "sess_1",
      });
      mockPathname = "/";
      renderLayout();
      expect(screen.getByText("SAVECRAFT")).toBeInTheDocument();
    });

    it("does not render app shell before auth loads", () => {
      document.cookie = "__client_uat=1234567890; path=/";
      mockPathname = "/";
      renderLayout();
      expect(screen.queryByText("SAVECRAFT")).not.toBeInTheDocument();
    });

    it("connects WebSocket when signed in", () => {
      document.cookie = "__client_uat=1234567890; path=/";
      authStore.set({
        isLoaded: true,
        isSignedIn: true,
        user: { id: "user_1", firstName: "Test", imageUrl: "" },
        sessionId: "sess_1",
      });
      mockPathname = "/";
      renderLayout();
      expect(mockConnect).toHaveBeenCalledWith(mockHandleMessage);
    });
  });
});
