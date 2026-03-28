import { PUBLIC_CLERK_PUBLISHABLE_KEY } from "$env/static/public";
import type { Clerk } from "@clerk/clerk-js";
import { readable, type Readable } from "svelte/store";

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: {
    id: string;
    firstName: string | null;
    imageUrl: string;
  } | null;
  sessionId: string | null;
}

const SAVECRAFT_APPEARANCE = {
  variables: {
    colorPrimary: "#c8a84e",
    colorBackground: "#0a0e2e",
    colorInputBackground: "#05071a",
    colorInputText: "#e8e0d0",
    colorText: "#e8e0d0",
    colorTextSecondary: "#8890b8",
    colorDanger: "#e85a5a",
    fontFamily: "'VT323', monospace",
    fontSize: "18px",
    borderRadius: "4px",
  },
  elements: {
    socialButtonsBlockButton: {
      color: "#e8e0d0",
      background: "rgba(74, 90, 173, 0.25)",
      border: "1px solid rgba(74, 90, 173, 0.4)",
    },
    footerAction: {
      fontSize: "18px",
    },
    footerActionLink: {
      color: "#c8a84e",
      fontSize: "18px",
      textDecoration: "underline",
    },
    userButtonPopoverActionButton: {
      color: "#e8e0d0",
      fontSize: "14px",
      "&:hover": {
        color: "#e8e0d0",
        background: "rgba(74, 90, 173, 0.25)",
      },
    },
    userButtonPopoverActionButtonText: {
      color: "#e8e0d0",
      fontSize: "14px",
    },
    userButtonPopoverFooter: {
      display: "none",
    },
    alternativeMethodsBlockButton: {
      color: "#e8e0d0",
      background: "rgba(74, 90, 173, 0.25)",
      border: "1px solid rgba(74, 90, 173, 0.4)",
    },
    otpCodeFieldInput: {
      color: "#e8e0d0",
      background: "#05071a",
      border: "1px solid rgba(74, 90, 173, 0.4)",
      fontSize: "24px",
    },
  },
} as const;

const SAVECRAFT_LOCALIZATION = {
  signUp: {
    start: {
      title: "Create your account",
      subtitle: "Your save files, understood by AI",
    },
  },
  signIn: {
    start: {
      titleCombined: "Sign in or create an account",
      subtitleCombined: "Your save files, understood by AI",
      title: "Sign in or create an account",
      subtitle: "Your save files, understood by AI",
    },
  },
} as const;

let clerkInstance: Clerk | null = null;
let clerkLoading = false;
let clerkReady: Promise<Clerk> | null = null;
let resolveClerkReady: ((clerk: Clerk) => void) | null = null;

function createAuthState(): {
  store: Readable<AuthState>;
  update: (clerk: Clerk) => void;
} {
  let setter: ((value: AuthState) => void) | null = null;

  const store = readable<AuthState>(
    { isLoaded: false, isSignedIn: false, user: null, sessionId: null },
    (set) => {
      setter = set;
    },
  );

  function update(clerk: Clerk): void {
    if (!setter) return;
    const user = clerk.user;
    setter({
      isLoaded: true,
      isSignedIn: !!clerk.user,
      user: user
        ? {
            id: user.id,
            firstName: user.firstName,
            imageUrl: user.imageUrl,
          }
        : null,
      sessionId: clerk.session?.id ?? null,
    });
  }

  return { store, update };
}

const { store: authStateStore, update: updateAuthState } = createAuthState();

export const authState: Readable<AuthState> = authStateStore;

export async function initializeClerk(): Promise<void> {
  if (clerkInstance || clerkLoading) return;
  clerkLoading = true;

  const clerkModule = await import("@clerk/clerk-js");

  const clerk = new clerkModule.Clerk(PUBLIC_CLERK_PUBLISHABLE_KEY);

  await clerk.load({
    appearance: SAVECRAFT_APPEARANCE,
    localization: SAVECRAFT_LOCALIZATION,
  });

  // Set clerkInstance AFTER load() so awaitClerk() never returns an unloaded instance.
  clerkInstance = clerk;

  updateAuthState(clerk);
  clerk.addListener(() => {
    updateAuthState(clerk);
  });

  if (resolveClerkReady) resolveClerkReady(clerk);
}

export function getClerk(): Clerk {
  if (!clerkInstance) throw new Error("Clerk not initialized");
  return clerkInstance;
}

/** Returns a promise that resolves once Clerk is fully loaded. Safe to call from onMount. */
export function awaitClerk(): Promise<Clerk> {
  if (clerkInstance) return Promise.resolve(clerkInstance);
  clerkReady ??= new Promise<Clerk>((resolve) => {
    resolveClerkReady = resolve;
  });
  return clerkReady;
}

export async function getToken(): Promise<string | null> {
  if (!clerkInstance?.session) return null;
  return clerkInstance.session.getToken();
}
