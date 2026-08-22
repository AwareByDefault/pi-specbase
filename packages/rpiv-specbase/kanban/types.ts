import type { DirectActionSelection } from "./action-dispatch.js";

export interface BoardAction {
	readonly id: string;
	readonly label: string;
	readonly enabled: boolean;
	readonly detail?: string;
	/** Frozen minimal canonical authority; absent for presentation-only fixtures. */
	readonly selection?: DirectActionSelection;
	/** Unmodified source descriptor retained for later dispatch adapters. */
	readonly source?: unknown;
}

export interface BoardStack {
	readonly id: string;
	readonly position: number;
	readonly total: number;
}

/** Full context returned by the canonical public stack API; never locally derived. */
export type BoardStackContext = Readonly<Record<string, unknown>>;

export interface BoardCard {
	readonly id: string;
	readonly title: string;
	readonly summary: string;
	/** Concise live activity badge rendered on the card row; detail retains the full recap. */
	readonly activity?: string;
	/** Complete live activity recap shown only in selected-card detail. */
	readonly activityDetail?: string;
	/** Exact canonical stack identity and position, when the card is annotated. */
	readonly stack?: BoardStack;
	/** Stable compact rail label derived only from the canonical stack identity. */
	readonly stackLabel?: string;
	/** Full canonical stack detail resolved during the source load, when available. */
	readonly stackContext?: BoardStackContext;
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
	/** Present only when a canonical live adapter supplied dispatch authority. */
	readonly selection?: DirectActionSelection;
}

export interface BoardCancelledIntent {
	readonly kind: "cancelled";
}

export type BoardIntent = BoardSelectionIntent | BoardCancelledIntent;
