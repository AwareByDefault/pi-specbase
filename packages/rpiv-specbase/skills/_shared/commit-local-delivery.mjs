#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (name) => {
	const i = argv.indexOf(name);
	return i >= 0 ? argv[i + 1] : undefined;
};
const allAfter = (name) => {
	const i = argv.indexOf(name);
	if (i < 0) return [];
	const values = [];
	for (let j = i + 1; j < argv.length && !argv[j].startsWith("--"); j++) values.push(argv[j]);
	return values;
};
const contextPathArg = flag("--context");
const message = flag("--message");
const requested = allAfter("--paths");
if (!contextPathArg || !message || requested.length === 0) {
	console.error("usage: commit-local-delivery.mjs --context <path> --message <message> --paths <path...>");
	process.exit(2);
}

const cwd = realpathSync(process.cwd());
const contextPath = realpathSync(resolve(cwd, contextPathArg));
const contextRoot = resolve(cwd, ".rpiv", "artifacts", "specbase-local-delivery");
const contextRel = relative(contextRoot, contextPath);
if (contextRel.startsWith(`..${sep}`) || contextRel === ".." || !contextRel.endsWith(`${sep}delivery-context.json`)) {
	throw new Error("context path is not a canonical local-delivery artifact");
}
const context = JSON.parse(readFileSync(contextPath, "utf8"));
if (context?.version !== 1 || realpathSync(resolve(context.authorization?.root ?? "")) !== cwd) {
	throw new Error("context root/version does not match the current repository");
}
const lease = JSON.parse(readFileSync(context.leasePath, "utf8"));
if (lease.ownerId !== context.ownerId || lease.root !== cwd) throw new Error("local-delivery lease ownership is not current");

const run = (args, allowFailure = false) => {
	const guardedArgs = [
		"-c",
		"core.hooksPath=/dev/null",
		"-c",
		"core.fsmonitor=false",
		"-c",
		"commit.gpgsign=false",
		...args,
	];
	const result = spawnSync("git", guardedArgs, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
	});
	if (!allowFailure && result.status !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
	}
	return result;
};
const normalize = (path) => {
	const absolute = isAbsolute(path) ? resolve(path) : resolve(cwd, path);
	return relative(cwd, absolute).split(sep).join("/") || ".";
};
const within = (path, roots) => {
	const absolute = resolve(cwd, path);
	return roots.some((root) => {
		const rel = relative(resolve(root), absolute);
		return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
	});
};
const paths = [...new Set(requested.map(normalize))].sort();
for (const path of paths) {
	if (path === "." || /[*?[\]]/u.test(path)) throw new Error(`broad pathspec refused: ${path}`);
	if (context.baselineDirtyPaths.includes(path)) throw new Error(`baseline-dirty path refused: ${path}`);
	if (!within(path, context.allowedRoots)) throw new Error(`path outside frozen scope refused: ${path}`);
}
if (context.startHead && run(["merge-base", "--is-ancestor", context.startHead, "HEAD"], true).status !== 0) {
	throw new Error("HEAD no longer descends from the captured start");
}
const names = () => run(["diff", "--cached", "--name-only", "-z"]).stdout.split("\0").filter(Boolean).sort();
const preStaged = names();
try {
	run(["add", "--", ...paths]);
	const staged = names();
	const expected = [...new Set([...preStaged, ...paths])].sort();
	if (JSON.stringify(staged) !== JSON.stringify(expected)) {
		throw new Error(`staged set mismatch: ${staged.join(", ")}`);
	}
	run(["commit", "-m", message, "--", ...paths]);
	process.stdout.write(`${run(["rev-parse", "HEAD"]).stdout.trim()}\n`);
} catch (error) {
	run(["reset", "--", ...paths], true);
	throw error;
}
