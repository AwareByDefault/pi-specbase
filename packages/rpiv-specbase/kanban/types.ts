export interface BoardAction {
	readonly id: string;
	readonly label: string;
	readonly enabled: boolean;
	readonly detail?: string;
}

export interface BoardCard {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly actions: readonly BoardAction[];
}

export interface BoardColumn {
	readonly id: string;
	readonly label: string;
	readonly cards: readonly BoardCard[];
}

/** Presentation input only; sources own lifecycle and action semantics. */
export interface BoardSnapshot {
	readonly id: string;
	readonly title: string;
	readonly columns: readonly BoardColumn[];
}

export interface BoardSelectionIntent {
	readonly kind: "selected";
	readonly cardId: string;
	readonly actionId: string;
}

export interface BoardCancelledIntent {
	readonly kind: "cancelled";
}

export type BoardIntent = BoardSelectionIntent | BoardCancelledIntent;
