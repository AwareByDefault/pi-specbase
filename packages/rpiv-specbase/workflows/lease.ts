import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import lockfile from "proper-lockfile";

export interface DeliveryLeaseRecord {
	readonly version: 1;
	readonly ownerId: string;
	readonly pid: number;
	readonly acquiredAt: string;
	readonly root: string;
	readonly storeId: string | null;
	readonly changeId: string;
	readonly runId?: string;
}

export interface DeliveryLeaseKey {
	readonly root: string;
	readonly storeId: string | null;
	readonly changeId: string;
}

/** Test seam for stale-lock timing. Live callers use the conservative defaults. */
export interface LeaseReconciliation {
	readonly staleMs?: number;
	readonly updateMs?: number;
}

export type DeliveryLeaseAcquireResult =
	| {
			readonly acquired: true;
			readonly path: string;
			readonly record: DeliveryLeaseRecord;
			readonly reconciled: boolean;
	  }
	| { readonly acquired: false; readonly path: string; readonly holder: DeliveryLeaseRecord; readonly reason: string };

type HeldLease = { readonly ownerId: string; readonly release: () => void };
const held = new Map<string, HeldLease>();

const safePrefix = (value: string): string => value.replaceAll(/[^A-Za-z0-9._-]/gu, "_").slice(0, 32) || "unknown";

function identityDigest(key: DeliveryLeaseKey): string {
	return createHash("sha256")
		.update(JSON.stringify([resolve(key.root), key.storeId, key.changeId]))
		.digest("hex");
}

function assertContained(root: string, candidate: string): void {
	const rel = relative(root, candidate);
	if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith("/") || rel.startsWith("\\")) {
		throw new Error(`Local-delivery run-control path escaped the repository root: ${candidate}`);
	}
}

/** Reject an existing symlink anywhere in the package-owned run-control prefix. */
function ensureRunControlRoot(rootInput: string): string {
	const root = realpathSync(resolve(rootInput));
	const parts = [".rpiv", "specbase-local-delivery", "leases"];
	let current = root;
	for (const part of parts) {
		current = join(current, part);
		assertContained(root, current);
		try {
			if (lstatSync(current).isSymbolicLink()) throw new Error(`Refusing symlinked run-control path: ${current}`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			mkdirSync(current, { recursive: false, mode: 0o700 });
		}
	}
	return current;
}

export function deliveryLeasePath(key: DeliveryLeaseKey): string {
	const dir = ensureRunControlRoot(key.root);
	const prefix = safePrefix(key.changeId);
	return join(dir, `${prefix}-${identityDigest(key)}.json`);
}

export function readDeliveryLease(path: string): DeliveryLeaseRecord | undefined {
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as Partial<DeliveryLeaseRecord>;
		if (
			value.version !== 1 ||
			typeof value.ownerId !== "string" ||
			typeof value.pid !== "number" ||
			typeof value.acquiredAt !== "string" ||
			typeof value.root !== "string" ||
			!(typeof value.storeId === "string" || value.storeId === null) ||
			typeof value.changeId !== "string"
		)
			return undefined;
		return value as DeliveryLeaseRecord;
	} catch {
		return undefined;
	}
}

function atomicWrite(path: string, record: DeliveryLeaseRecord): void {
	const temp = `${path}.${record.ownerId}.tmp`;
	writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
	renameSync(temp, path);
}

export function acquireDeliveryLease(
	key: DeliveryLeaseKey,
	ownerId: string,
	reconciliation: LeaseReconciliation = {},
): DeliveryLeaseAcquireResult {
	const path = deliveryLeasePath(key);
	const previous = readDeliveryLease(path);
	let release: (() => void) | undefined;
	try {
		release = lockfile.lockSync(path, {
			realpath: false,
			retries: 0,
			stale: reconciliation.staleMs ?? 30_000,
			update: reconciliation.updateMs ?? 10_000,
		});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ELOCKED") throw error;
		const holder = readDeliveryLease(path) ??
			previous ?? {
				version: 1 as const,
				ownerId: "another process",
				pid: -1,
				acquiredAt: "unknown",
				root: resolve(key.root),
				storeId: key.storeId,
				changeId: key.changeId,
			};
		return {
			acquired: false,
			path,
			holder,
			reason: `Local delivery for '${key.changeId}' is already owned by ${holder.ownerId} (pid ${holder.pid}).`,
		};
	}

	const record: DeliveryLeaseRecord = {
		version: 1,
		ownerId,
		pid: process.pid,
		acquiredAt: new Date().toISOString(),
		root: realpathSync(resolve(key.root)),
		storeId: key.storeId,
		changeId: key.changeId,
	};
	try {
		atomicWrite(path, record);
		held.set(path, { ownerId, release });
		return { acquired: true, path, record, reconciled: previous !== undefined && previous.ownerId !== ownerId };
	} catch (error) {
		release();
		throw error;
	}
}

export function attachRunToDeliveryLease(path: string, ownerId: string, runId: string): void {
	const current = readDeliveryLease(path);
	const owned = held.get(path);
	if (!current || current.ownerId !== ownerId || owned?.ownerId !== ownerId)
		throw new Error("Cannot attach a run to a delivery lease owned by another run.");
	atomicWrite(path, { ...current, runId });
}

export function releaseDeliveryLease(path: string, ownerId: string): boolean {
	const current = readDeliveryLease(path);
	const owned = held.get(path);
	if (!current || current.ownerId !== ownerId || owned?.ownerId !== ownerId) return false;
	// Remove metadata while the advisory lock is still held, then atomically release
	// the lock directory. A replacement owner cannot appear between check and unlink.
	rmSync(path, { force: true });
	held.delete(path);
	owned.release();
	return true;
}
