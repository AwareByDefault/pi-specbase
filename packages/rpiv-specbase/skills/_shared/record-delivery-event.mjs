#!/usr/bin/env node
import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const [contextPathArg, kind, unitId, detailJson = "{}"] = process.argv.slice(2);
if (!contextPathArg || !kind) {
	console.error("usage: record-delivery-event.mjs <context> <kind> [unit-id] [detail-json]");
	process.exit(2);
}
const allowedKinds = new Set(["unit-start", "unit-complete", "unit-failed", "remediate", "review", "local-fix", "commit"]);
if (!allowedKinds.has(kind)) throw new Error(`unsupported delivery event kind: ${kind}`);
if (kind.startsWith("unit-") && !/^(?:evidence|task):[^:]+/u.test(unitId ?? "")) {
	throw new Error("unit events require a kind-qualified evidence:<id> or task:<id> identity");
}
const cwd = realpathSync(process.cwd());
const contextPath = realpathSync(resolve(cwd, contextPathArg));
const artifactRoot = resolve(cwd, ".rpiv", "artifacts", "specbase-local-delivery");
const contextRel = relative(artifactRoot, contextPath);
if (contextRel.startsWith(`..${sep}`) || contextRel === ".." || !contextRel.endsWith(`${sep}delivery-context.json`)) {
	throw new Error("context path is not a canonical local-delivery artifact");
}
const context = JSON.parse(readFileSync(contextPath, "utf8"));
if (context?.version !== 1 || realpathSync(resolve(context.authorization?.root ?? "")) !== cwd) {
	throw new Error("context root/version does not match the current repository");
}
const expectedRecord = resolve(contextPath, "..", "implementation.jsonl");
if (resolve(context.implementationRecordPath) !== expectedRecord) throw new Error("implementation record escaped its run directory");
const lease = JSON.parse(readFileSync(context.leasePath, "utf8"));
if (lease.ownerId !== context.ownerId || lease.root !== cwd) throw new Error("local-delivery lease ownership is not current");
const event = {
	ts: new Date().toISOString(),
	kind,
	...(unitId && unitId !== "-" ? { unitId } : {}),
	detail: JSON.parse(detailJson),
};
appendFileSync(expectedRecord, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
