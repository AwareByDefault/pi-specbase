export interface BoardAction {
	readonly id: string;
	readonly label: string;
	readonly enabled: boolean;
	readonly detail?: string;
	/** Unmodified source descriptor retained for later dispatch adapters. */
	readonly source?: unknown;
}

export interface BoardCard {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	readonly actions: readonly BoardAction[];
	/** Unmodified source card retained across the presentation seam. */
	readonly source?: unknown;
}

export interface BoardColumn {
	readonly id: string;
	readonly label: string;
	readonly cards: readonly BoardCard[];
	/** Unmodified source lane retained across the presentation seam. */
	readonly source?: unknown;
}

/** Presentation input only; sources own lifecycle and action semantics. */
export interface BoardSnapshot {
	readonly id: string;
	readonly title: string;
	readonly columns: readonly BoardColumn[];
	/** Canonical diagnostic messages/remediation available to the renderer. */
	readonly notices?: readonly string[];
	/** Complete unmodified source snapshot for parity and later adapters. */
	readonly source?: unknown;
}

export type BoardLoadStatus =
	| { readonly kind: "loading"; readonly message: string }
	| { readonly kind: "refreshing"; readonly message: string }
	| { readonly kind: "ready"; readonly message: string }
	| { readonly kind: "empty"; readonly message: string }
	| { readonly kind: "stale"; readonly message: string; readonly retry: true }
	| { readonly kind: "failure"; readonly message: string; readonly retry: true };

export interface BoardSelectionIntent {
	readonly kind: "selected";
	readonly cardId: string;
	readonly actionId: string;
}

export interface BoardCancelledIntent {
	readonly kind: "cancelled";
}

export type BoardIntent = BoardSelectionIntent | BoardCancelledIntent;
