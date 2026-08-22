import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface PlaneFixture {
	readonly id: string;
	readonly purpose: string;
	readonly enforcementFlavor: string;
	readonly reviewLens?: string;
}

interface GeneratedSkill {
	readonly instructions: string;
}

const configPath = new URL("../../specbase/config.yaml", import.meta.url);
const generatedSkillPath = new URL("../../.pi/skills/specbase-review-panel/SKILL.md", import.meta.url);
const specbaseEntry = import.meta.resolve("@awarebydefault/specbase");
const { lensesFromPlanes } = (await import(new URL("./core/governed/lenses.js", specbaseEntry).href)) as {
	lensesFromPlanes: (model: { readonly planes: readonly PlaneFixture[] }) => Array<{ readonly id: string }>;
};
const { getReviewPanelSkillTemplate } = (await import(
	new URL("./core/templates/workflows/review-panel.js", specbaseEntry).href
)) as {
	getReviewPanelSkillTemplate: (model: {
		readonly kind: "governed";
		readonly planes: readonly PlaneFixture[];
	}) => GeneratedSkill;
};

function projectedLensIds(config: string): string[] {
	return [
		...new Set([...config.matchAll(/^\s*reviewLens:\s*([^\s#]+)\s*$/gmu)].map((match) => match[1])),
		"enforcement",
	].sort();
}

function declaredLensIds(skill: string): string[] {
	const lensTable = skill.match(
		/\*\*Lens scope = the projected lens set for this project:\*\*\n\n(?<table>(?:\|.*\n)+)/u,
	);
	if (!lensTable?.groups?.table) throw new Error("Generated review-panel skill has no projected lens table.");
	return [...lensTable.groups.table.matchAll(/^\| `([^`]+)` \|/gmu)].map((match) => match[1]).sort();
}

function governedModel(planes: readonly PlaneFixture[]) {
	return { kind: "governed" as const, planes };
}

describe("generated Specbase review-panel governance", () => {
	it("projects configured review lenses into the Pi-discoverable generated instrument", () => {
		expect(existsSync(fileURLToPath(generatedSkillPath))).toBe(true);
		const skill = readFileSync(generatedSkillPath, "utf8");
		expect(skill).toMatch(/^---\nname: specbase-review-panel\n/mu);
		expect(skill).toContain("generatedBy:");

		const expected = projectedLensIds(readFileSync(configPath, "utf8"));
		expect(declaredLensIds(skill)).toEqual(expected);
		expect(declaredLensIds(skill)).not.toContain("agents");
	});

	it("keeps the model-derived panel non-empty without a fixed plane roster", () => {
		const focused = governedModel([
			{ id: "focused", purpose: "Focused specs", enforcementFlavor: "test", reviewLens: "focused" },
			{ id: "agents", purpose: "Agent instruments", enforcementFlavor: "conformance" },
		]);
		const focusedSkill = getReviewPanelSkillTemplate(focused).instructions;
		expect(declaredLensIds(focusedSkill)).toEqual(
			lensesFromPlanes(focused)
				.map((lens) => lens.id)
				.sort(),
		);
		expect(declaredLensIds(focusedSkill)).not.toContain("agents");

		const generalSkill = getReviewPanelSkillTemplate(
			governedModel([{ id: "agents", purpose: "Agent instruments", enforcementFlavor: "conformance" }]),
		).instructions;
		expect(declaredLensIds(generalSkill)).toEqual(["spec-conformance"]);
		expect(generalSkill).toContain("This is the panel's one\njob, unedited");
	});
});
