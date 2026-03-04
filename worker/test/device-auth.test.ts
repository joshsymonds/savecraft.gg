import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { cleanAll } from "./helpers";

interface RegisterResponse {
	device_uuid: string;
	device_token: string;
	link_code: string;
	link_code_expires_at: string;
}

async function registerDevice(): Promise<RegisterResponse> {
	const resp = await SELF.fetch(
		new Request("https://test-host/api/v1/device/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ hostname: "test-pc", os: "linux", arch: "amd64" }),
		}),
	);
	return resp.json<RegisterResponse>();
}

describe("Device Token Authentication", () => {
	beforeEach(cleanAll);

	it("authenticates a registered device via verify endpoint", async () => {
		const device = await registerDevice();

		const resp = await SELF.fetch("https://test-host/api/v1/device/verify", {
			headers: { Authorization: `Bearer ${device.device_token}` },
		});
		expect(resp.status).toBe(200);

		const body = await resp.json<{ status: string; device_uuid: string }>();
		expect(body.status).toBe("ok");
		expect(body.device_uuid).toBe(device.device_uuid);
	});

	it("rejects invalid device token", async () => {
		const resp = await SELF.fetch("https://test-host/api/v1/device/verify", {
			headers: { Authorization: "Bearer dvt_invalid_token_here" },
		});
		expect(resp.status).toBe(401);
	});

	it("rejects missing auth header", async () => {
		const resp = await SELF.fetch("https://test-host/api/v1/device/verify");
		expect(resp.status).toBe(401);
	});

	it("updates last_push_at on successful auth", async () => {
		const device = await registerDevice();

		// Verify last_push_at is null before auth
		const before = await env.DB.prepare(
			"SELECT last_push_at FROM devices WHERE device_uuid = ?",
		)
			.bind(device.device_uuid)
			.first<{ last_push_at: string | null }>();
		expect(before!.last_push_at).toBeNull();

		await SELF.fetch("https://test-host/api/v1/device/verify", {
			headers: { Authorization: `Bearer ${device.device_token}` },
		});

		const after = await env.DB.prepare(
			"SELECT last_push_at FROM devices WHERE device_uuid = ?",
		)
			.bind(device.device_uuid)
			.first<{ last_push_at: string | null }>();
		expect(after!.last_push_at).not.toBeNull();
	});

	it("returns null userUuid for unlinked device", async () => {
		const device = await registerDevice();

		const resp = await SELF.fetch("https://test-host/api/v1/device/verify", {
			headers: { Authorization: `Bearer ${device.device_token}` },
		});
		const body = await resp.json<{ user_uuid: string | null }>();
		expect(body.user_uuid).toBeNull();
	});

	it("returns userUuid for linked device", async () => {
		const device = await registerDevice();
		const testUserUuid = "linked-user-123";

		// Simulate linking by updating the device row directly
		await env.DB.prepare("UPDATE devices SET user_uuid = ? WHERE device_uuid = ?")
			.bind(testUserUuid, device.device_uuid)
			.run();

		const resp = await SELF.fetch("https://test-host/api/v1/device/verify", {
			headers: { Authorization: `Bearer ${device.device_token}` },
		});
		const body = await resp.json<{ user_uuid: string | null }>();
		expect(body.user_uuid).toBe(testUserUuid);
	});
});
