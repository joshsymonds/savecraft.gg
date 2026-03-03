/**
 * OAuth provider configuration using @cloudflare/workers-oauth-provider.
 *
 * Our Worker is a full OAuth Authorization Server. The library handles
 * DCR, token issuance/refresh, metadata endpoints, and token validation.
 * Clerk is the upstream IdP — /oauth/authorize redirects to Clerk for
 * login, /oauth/callback exchanges the code and calls completeAuthorization()
 * so the library issues our own tokens.
 *
 * Token validation is local (KV lookup) — no per-request call to Clerk.
 */
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

import { handleMcpRequest } from "./mcp/handler";
import type { Env } from "./types";

export interface OAuthProps {
  userUuid: string;
}

/** Endpoint config shared between the worker and test helpers. */
export const OAUTH_ENDPOINTS = {
  apiRoute: "/mcp",
  authorizeEndpoint: "/oauth/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
} as const;

/**
 * Build the OAuthProvider that wraps the entire Worker.
 *
 * - apiRoute "/mcp": library validates token, passes props.userUuid to MCP handler
 * - defaultHandler: /oauth/authorize, /oauth/callback, plus all non-MCP routes
 * - Library auto-handles: /.well-known/*, /oauth/register, /oauth/token
 */
export function buildOAuthProvider(defaultHandler: ExportedHandler<Env>): OAuthProvider<Env> {
  return new OAuthProvider<Env>({
    ...OAUTH_ENDPOINTS,
    apiHandler: {
      async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // The library injects `props` onto ctx at runtime after token validation.
        // There is no typed augmentation — this cast is the intended API pattern.
        const props = (ctx as ExecutionContext & { props?: OAuthProps }).props;
        const userUuid = props?.userUuid;
        if (!userUuid) {
          return new Response("Unauthorized", { status: 401 });
        }
        return handleMcpRequest(request, env, userUuid);
      },
    },
    defaultHandler,
    resourceMetadata: {
      resource_name: "Savecraft MCP Server",
    },
  });
}

/**
 * /oauth/authorize — redirect to Clerk's OAuth authorize endpoint.
 *
 * The library's metadata endpoints tell MCP clients to come here.
 * We store the parsed auth request in KV, then redirect to Clerk.
 * After Clerk login, Clerk redirects to /oauth/callback.
 */
export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  if (!env.CLERK_ISSUER || !env.CLERK_OAUTH_CLIENT_ID) {
    return Response.json(
      { error: "Clerk OAuth not configured (CLERK_ISSUER and CLERK_OAUTH_CLIENT_ID required)" },
      { status: 503 },
    );
  }

  const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);

  // Verify the client exists (was registered via DCR)
  const client = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  if (!client) {
    return new Response("Unknown client", { status: 400 });
  }

  // Store the MCP client's authorize params so we can complete authorization in the callback
  const stateKey = crypto.randomUUID();
  await env.OAUTH_KV.put(`clerk-auth-state:${stateKey}`, JSON.stringify(oauthReqInfo), {
    expirationTtl: 600,
  });

  // Redirect to Clerk's OAuth authorize endpoint
  const clerkAuthorizeUrl = new URL(`${env.CLERK_ISSUER}/oauth/authorize`);
  clerkAuthorizeUrl.searchParams.set("client_id", env.CLERK_OAUTH_CLIENT_ID);
  clerkAuthorizeUrl.searchParams.set(
    "redirect_uri",
    `${new URL(request.url).origin}/oauth/callback`,
  );
  clerkAuthorizeUrl.searchParams.set("response_type", "code");
  clerkAuthorizeUrl.searchParams.set("state", stateKey);
  clerkAuthorizeUrl.searchParams.set("scope", "openid profile");

  return Response.redirect(clerkAuthorizeUrl.toString(), 302);
}

/**
 * /oauth/callback — handle Clerk's OAuth callback.
 *
 * 1. Look up stored MCP authorize params from KV by state.
 * 2. Exchange Clerk code for Clerk access token.
 * 3. Get user info from Clerk's /oauth/userinfo.
 * 4. Call completeAuthorization() to issue our own tokens.
 * 5. Redirect to the URL returned by the library.
 */
export async function handleCallback(request: Request, env: Env): Promise<Response> {
  if (!env.CLERK_ISSUER || !env.CLERK_OAUTH_CLIENT_ID) {
    return new Response("Clerk OAuth not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateKey = url.searchParams.get("state");

  if (!code || !stateKey) {
    return new Response("Missing code or state", { status: 400 });
  }

  // Retrieve and delete the stored MCP authorize params (one-time use)
  const storedRaw = await env.OAUTH_KV.get(`clerk-auth-state:${stateKey}`);
  if (!storedRaw) {
    return new Response("Invalid or expired state", { status: 400 });
  }
  await env.OAUTH_KV.delete(`clerk-auth-state:${stateKey}`);

  const oauthReqInfo = JSON.parse(storedRaw) as {
    responseType: string;
    clientId: string;
    redirectUri: string;
    scope: string[];
    state: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
    resource?: string | string[];
  };

  // Exchange Clerk authorization code for Clerk access token
  const tokenResp = await fetch(`${env.CLERK_ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.CLERK_OAUTH_CLIENT_ID,
      client_secret: env.CLERK_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: `${url.origin}/oauth/callback`,
    }),
  });

  if (!tokenResp.ok) {
    return new Response("Failed to exchange code with Clerk", { status: 502 });
  }

  const tokenData = await tokenResp.json<{ access_token?: string }>();
  if (!tokenData.access_token) {
    return new Response("Clerk token exchange returned no access_token", { status: 502 });
  }

  // Get user info from Clerk
  const userinfoResp = await fetch(`${env.CLERK_ISSUER}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userinfoResp.ok) {
    return new Response("Failed to fetch user info from Clerk", { status: 502 });
  }

  const userinfo = await userinfoResp.json<{ sub?: string }>();
  if (!userinfo.sub) {
    return new Response("Clerk userinfo missing sub", { status: 502 });
  }

  // Complete authorization — the library issues our own tokens
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: userinfo.sub,
    metadata: {},
    scope: oauthReqInfo.scope,
    props: { userUuid: userinfo.sub } satisfies OAuthProps,
  });

  return Response.redirect(redirectTo, 302);
}
