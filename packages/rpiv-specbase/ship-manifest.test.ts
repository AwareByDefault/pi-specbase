import { verifyShipManifest } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it } from "vitest";

describe("publish manifest", () => {
	it("covers every production module in the Pi package", () => {
		const manifest = verifyShipManifest(import.meta.url);
		expect(manifest.missing).toEqual([]);
		expect(manifest.stale).toEqual([]);
	});
});
