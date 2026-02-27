import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

const TEST_USER = "api-keys-test-user";
const OTHER_USER = "api-keys-other-user";

interface CreateKeyResponse {
  id: string;
  key: string;
  prefix: string;
  label: string;
}

interface ListKeysResponse {
  keys: { id: string; prefix: string; label: string; created_at: string }[];
}

function createKeyRequest(userUuid: string, body?: Record<string, unknown>): Request {
  return new Request("https://test-host/api/v1/api-keys", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userUuid}`,
    },
    body: JSON.stringify(body ?? {}),
  });
}

function listKeysRequest(userUuid: string): Request {
  return new Request("https://test-host/api/v1/api-keys", {
    method: "GET",
    headers: { Authorization: `Bearer ${userUuid}` },
  });
}

function deleteKeyRequest(userUuid: string, keyId: string): Request {
  return new Request(`https://test-host/api/v1/api-keys/${keyId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userUuid}` },
  });
}

describe("API Key CRUD", () => {
  beforeEach(cleanAll);

  describe("POST /api/v1/api-keys", () => {
    it("creates a key and returns 201 with key details", async () => {
      const resp = await SELF.fetch(createKeyRequest(TEST_USER));
      expect(resp.status).toBe(201);

      const body = await resp.json<CreateKeyResponse>();
      expect(body.id).toBeTruthy();
      expect(body.key).toBeTruthy();
      expect(body.prefix).toBeTruthy();
      expect(body.label).toBe("default");
    });

    it("returned key starts with sav_", async () => {
      const resp = await SELF.fetch(createKeyRequest(TEST_USER));
      const body = await resp.json<CreateKeyResponse>();
      expect(body.key).toMatch(/^sav_/);
    });

    it("returned key is 36+ chars (sav_ prefix + 32 hex)", async () => {
      const resp = await SELF.fetch(createKeyRequest(TEST_USER));
      const body = await resp.json<CreateKeyResponse>();
      expect(body.key.length).toBeGreaterThanOrEqual(36);
    });

    it("accepts custom label", async () => {
      const resp = await SELF.fetch(createKeyRequest(TEST_USER, { label: "steam-deck" }));
      const body = await resp.json<CreateKeyResponse>();
      expect(body.label).toBe("steam-deck");
    });

    it("returns 401 without auth", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(resp.status).toBe(401);
    });

    it("accepts empty body and uses default label", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/api-keys", {
          method: "POST",
          headers: { Authorization: `Bearer ${TEST_USER}` },
        }),
      );
      expect(resp.status).toBe(201);
      const body = await resp.json<CreateKeyResponse>();
      expect(body.label).toBe("default");
    });

    it("returns 400 for malformed JSON body", async () => {
      const resp = await SELF.fetch(
        new Request("https://test-host/api/v1/api-keys", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_USER}`,
          },
          body: "{invalid json",
        }),
      );
      expect(resp.status).toBe(400);
    });
  });

  describe("GET /api/v1/api-keys", () => {
    it("lists created keys with prefix, never full key", async () => {
      // Create a key
      const createResp = await SELF.fetch(createKeyRequest(TEST_USER));
      const created = await createResp.json<CreateKeyResponse>();

      // List keys
      const listResp = await SELF.fetch(listKeysRequest(TEST_USER));
      expect(listResp.status).toBe(200);

      const body = await listResp.json<ListKeysResponse>();
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0]!.id).toBe(created.id);
      expect(body.keys[0]!.prefix).toBe(created.prefix);
      expect(body.keys[0]!.label).toBe("default");
      expect(body.keys[0]!.created_at).toBeTruthy();

      // Full key should NOT appear in listing
      const listJson = JSON.stringify(body);
      expect(listJson).not.toContain(created.key);
    });

    it("returns only keys for authenticated user", async () => {
      // Create keys for two users
      await SELF.fetch(createKeyRequest(TEST_USER));
      await SELF.fetch(createKeyRequest(OTHER_USER));

      const listResp = await SELF.fetch(listKeysRequest(TEST_USER));
      const body = await listResp.json<ListKeysResponse>();
      expect(body.keys).toHaveLength(1);
    });

    it("lists multiple keys per user", async () => {
      await SELF.fetch(createKeyRequest(TEST_USER, { label: "key-1" }));
      await SELF.fetch(createKeyRequest(TEST_USER, { label: "key-2" }));
      await SELF.fetch(createKeyRequest(TEST_USER, { label: "key-3" }));

      const listResp = await SELF.fetch(listKeysRequest(TEST_USER));
      const body = await listResp.json<ListKeysResponse>();
      expect(body.keys).toHaveLength(3);

      const labels = body.keys.map((k) => k.label).toSorted((a, b) => a.localeCompare(b));
      expect(labels).toEqual(["key-1", "key-2", "key-3"]);
    });
  });

  describe("DELETE /api/v1/api-keys/:keyId", () => {
    it("deletes a key and returns 200 with deleted: true", async () => {
      const createResp = await SELF.fetch(createKeyRequest(TEST_USER));
      const created = await createResp.json<CreateKeyResponse>();

      const deleteResp = await SELF.fetch(deleteKeyRequest(TEST_USER, created.id));
      expect(deleteResp.status).toBe(200);
      const deleteBody = await deleteResp.json<{ deleted: boolean }>();
      expect(deleteBody.deleted).toBe(true);

      // Key should no longer appear in list
      const listResp = await SELF.fetch(listKeysRequest(TEST_USER));
      const body = await listResp.json<ListKeysResponse>();
      expect(body.keys).toHaveLength(0);
    });

    it("returns 404 when deleting another user's key", async () => {
      const createResp = await SELF.fetch(createKeyRequest(TEST_USER));
      const created = await createResp.json<CreateKeyResponse>();

      // Other user tries to delete
      const deleteResp = await SELF.fetch(deleteKeyRequest(OTHER_USER, created.id));
      expect(deleteResp.status).toBe(404);
    });

    it("deleted key no longer appears in D1", async () => {
      // Create key
      const createResp = await SELF.fetch(createKeyRequest(TEST_USER));
      const created = await createResp.json<CreateKeyResponse>();

      // Delete key
      await SELF.fetch(deleteKeyRequest(TEST_USER, created.id));

      // Key should be gone from D1
      const row = await env.DB.prepare("SELECT id FROM api_keys WHERE id = ?")
        .bind(created.id)
        .first();
      expect(row).toBeNull();
    });
  });
});
