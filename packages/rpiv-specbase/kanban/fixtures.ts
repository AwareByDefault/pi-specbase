import type { BoardSnapshot } from "./types.js";

/** Stable, presentation-only fixture data for `/spcb:kanban --demo`. */
export const DEMO_BOARD_SNAPSHOT: BoardSnapshot = {
	id: "fixture-specbase-board",
	title: "Specbase fixture board",
	columns: [
		{
			id: "idea",
			label: "Ideas with a deliberately long lifecycle label",
			cards: [
				{
					id: "fixture-idea-kanban",
					title: "Open a fixture-backed Specbase kanban in Pi",
					summary: "A deterministic starting point for a future live Specbase adapter.",
					actions: [
						{ id: "explore", label: "Explore fixture intent", enabled: true },
						{
							id: "blocked",
							label: "Await unavailable live source",
							enabled: false,
							detail: "Shown only as a blocked-looking fixture action.",
						},
					],
				},
			],
		},
		{
			id: "planned",
			label: "Planned",
			cards: [],
		},
		{
			id: "applying",
			label: "Applying",
			cards: [
				{
					id: "fixture-package-boundary",
					title: "Keep the renderer source-neutral",
					summary: "The board consumes snapshots and returns opaque selection intents only.",
					actions: [{ id: "inspect", label: "Inspect fixture intent", enabled: true }],
				},
			],
		},
	],
};
