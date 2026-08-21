import { readFileSync } from "node:fs";
import { verifyShipManifest } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it } from "vitest";
import {
	createLocalDeliveryCapabilityHandler,
	createSpecbaseCapabilityDispatcher,
	ensureSpecbaseLocalDeliveryRuntime,
	LOCAL_DELIVERY_CAPABILITY_ID,
	LOCAL_DELIVERY_WORKFLOW_NAME,
} from "./index.js";

describe("publish manifest", () => {
	it("covers every production module in the Pi package", () => {
		const manifest = verifyShipManifest(import.meta.url);
		expect(manifest.missing).toEqual([]);
		expect(manifest.stale).toEqual([]);
	});

	it("exports the local-delivery capability contract through the package root", () => {
		expect(LOCAL_DELIVERY_CAPABILITY_ID).toBe("specbase.local-delivery");
		expect(LOCAL_DELIVERY_WORKFLOW_NAME).toBe("specbase-local-delivery");
		expect(createLocalDeliveryCapabilityHandler).toBeTypeOf("function");
		expect(createSpecbaseCapabilityDispatcher).toBeTypeOf("function");
		expect(ensureSpecbaseLocalDeliveryRuntime).toBeTypeOf("function");
	});

	it("marks the root observer so detached workflow children do not load it", () => {
		const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
			pi?: { ambientObserver?: boolean };
		};
		expect(pkg.pi?.ambientObserver).toBe(true);
	});
});
