import { readFileSync } from "node:fs";
import { verifyShipManifest } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it } from "vitest";

describe("publish manifest", () => {
	it("covers every production module in the Pi package", () => {
		const manifest = verifyShipManifest(import.meta.url);
		expect(manifest.missing).toEqual([]);
		expect(manifest.stale).toEqual([]);
	});

	it("marks the root observer so detached workflow children do not load it", () => {
		const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
			pi?: { ambientObserver?: boolean };
		};
		expect(pkg.pi?.ambientObserver).toBe(true);
	});
});
