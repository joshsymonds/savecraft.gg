import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

const TEST_USER = "notes-test-user";

// Use unique save names per test to avoid UNIQUE(user_uuid, game_id, save_name) collisions
let charSeq = 0;

async function seedSave(saveUuid: string, userUuid: string): Promise<void> {
  charSeq++;
  await env.DB.prepare(
    "INSERT INTO saves (uuid, user_uuid, game_id, game_name, save_name, summary, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      saveUuid,
      userUuid,
      "d2r",
      "Diablo II: Resurrected",
      `Char-${String(charSeq)}`,
      "Hammerdin, Level 89",
      "2026-02-25T21:30:00Z",
    )
    .run();
}

function notesRequest(method: string, path: string, body?: unknown, userUuid = TEST_USER): Request {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userUuid}`,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request(`https://test-host${path}`, init);
}

// ── REST API: Notes CRUD ──────────────────────────────────────

describe("Notes REST API", () => {
  beforeEach(async () => {
    await cleanAll();
    charSeq = 0;
  });

  const SAVE_ID = "notes-rest-save";

  it("creates a note", async () => {
    await seedSave(SAVE_ID, TEST_USER);

    const resp = await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${SAVE_ID}`, {
        title: "Farming Goals",
        content: "Need: Jah rune, Ber rune",
      }),
    );
    expect(resp.status).toBe(201);

    const body = await resp.json<{ note_id: string }>();
    expect(body.note_id).toBeTruthy();
  });

  it("lists notes for a save", async () => {
    const saveId = "notes-list-save";
    await seedSave(saveId, TEST_USER);

    // Create two notes
    await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Note 1",
        content: "Content 1",
      }),
    );
    await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Note 2",
        content: "Content 2",
      }),
    );

    const resp = await SELF.fetch(notesRequest("GET", `/api/v1/notes/${saveId}`));
    expect(resp.status).toBe(200);

    const body = await resp.json<{
      notes: {
        note_id: string;
        title: string;
        content: string;
        source: string;
        size_bytes: number;
        updated_at: string;
      }[];
    }>();
    expect(body.notes).toHaveLength(2);
    expect(body.notes[0]!.title).toBeTruthy();
    expect(body.notes[0]!.content).toBeTruthy();
    expect(body.notes[0]!.source).toBe("user");
    expect(body.notes[0]!.size_bytes).toBeGreaterThan(0);
    expect(body.notes[0]!.updated_at).toBeTruthy();
  });

  it("gets a single note with full content", async () => {
    const saveId = "notes-get-save";
    await seedSave(saveId, TEST_USER);

    const createResp = await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Build Guide",
        content: "## Gear\n\nHarlequin Crest",
      }),
    );
    const { note_id } = await createResp.json<{ note_id: string }>();

    const resp = await SELF.fetch(notesRequest("GET", `/api/v1/notes/${saveId}/${note_id}`));
    expect(resp.status).toBe(200);

    const body = await resp.json<{ note_id: string; title: string; content: string }>();
    expect(body.note_id).toBe(note_id);
    expect(body.title).toBe("Build Guide");
    expect(body.content).toBe("## Gear\n\nHarlequin Crest");
  });

  it("updates a note", async () => {
    const saveId = "notes-update-save";
    await seedSave(saveId, TEST_USER);

    const createResp = await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Goals",
        content: "Farm for Ber",
      }),
    );
    const { note_id } = await createResp.json<{ note_id: string }>();

    const resp = await SELF.fetch(
      notesRequest("PUT", `/api/v1/notes/${saveId}/${note_id}`, {
        content: "Found Ber! Now farming Jah",
        title: "Updated Goals",
      }),
    );
    expect(resp.status).toBe(200);

    // Verify the update
    const getResp = await SELF.fetch(notesRequest("GET", `/api/v1/notes/${saveId}/${note_id}`));
    const body = await getResp.json<{ title: string; content: string }>();
    expect(body.title).toBe("Updated Goals");
    expect(body.content).toBe("Found Ber! Now farming Jah");
  });

  it("deletes a note", async () => {
    const saveId = "notes-delete-save";
    await seedSave(saveId, TEST_USER);

    const createResp = await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Temp Note",
        content: "Delete me",
      }),
    );
    const { note_id } = await createResp.json<{ note_id: string }>();

    const resp = await SELF.fetch(notesRequest("DELETE", `/api/v1/notes/${saveId}/${note_id}`));
    expect(resp.status).toBe(200);

    // Verify it's gone
    const getResp = await SELF.fetch(notesRequest("GET", `/api/v1/notes/${saveId}/${note_id}`));
    expect(getResp.status).toBe(404);
  });

  it("rejects note creation for a non-existent save", async () => {
    const resp = await SELF.fetch(
      notesRequest("POST", "/api/v1/notes/nonexistent-save", {
        title: "Test",
        content: "Test",
      }),
    );
    expect(resp.status).toBe(404);
  });

  it("rejects note creation for a save belonging to another user", async () => {
    const saveId = "notes-other-user-save";
    await seedSave(saveId, "other-user");

    const resp = await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Test",
        content: "Test",
      }),
    );
    expect(resp.status).toBe(404);
  });

  it("enforces 50KB content limit", async () => {
    const saveId = "notes-limit-save";
    await seedSave(saveId, TEST_USER);

    const resp = await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Huge Note",
        content: "x".repeat(51 * 1024),
      }),
    );
    expect(resp.status).toBe(413);
  });

  it("enforces 10 notes per save limit", async () => {
    const saveId = "notes-count-limit-save";
    await seedSave(saveId, TEST_USER);

    // Create 10 notes
    for (let index = 0; index < 10; index++) {
      const resp = await SELF.fetch(
        notesRequest("POST", `/api/v1/notes/${saveId}`, {
          title: `Note ${String(index)}`,
          content: `Content ${String(index)}`,
        }),
      );
      expect(resp.status).toBe(201);
    }

    // 11th should fail
    const resp = await SELF.fetch(
      notesRequest("POST", `/api/v1/notes/${saveId}`, {
        title: "Note 11",
        content: "One too many",
      }),
    );
    expect(resp.status).toBe(409);
  });

  it("rejects path traversal in save ID", async () => {
    const resp = await SELF.fetch(notesRequest("GET", "/api/v1/notes/..evil"));
    expect(resp.status).toBe(400);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toBe("Invalid save_id");
  });

  it("rejects path traversal in note ID", async () => {
    await seedSave(SAVE_ID, TEST_USER);
    const resp = await SELF.fetch(notesRequest("GET", `/api/v1/notes/${SAVE_ID}/..evil`));
    expect(resp.status).toBe(400);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toBe("Invalid note_id");
  });

  it("requires auth for all note operations", async () => {
    const resp = await SELF.fetch(
      new Request("https://test-host/api/v1/notes/some-save", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(resp.status).toBe(401);
  });
});
