import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { type BoardFocus, FixtureBoard } from "./fixture-board.js";
import type { LiveBoardSource } from "./live-source.js";
import type { BoardIntent, BoardLoadStatus, BoardSnapshot } from "./types.js";

export type LiveBoardState =
	| { readonly kind: "loading"; readonly snapshot: null; readonly error: null }
	| { readonly kind: "refreshing"; readonly snapshot: BoardSnapshot; readonly error: null }
	| { readonly kind: "ready"; readonly snapshot: BoardSnapshot; readonly error: null }
	| { readonly kind: "empty"; readonly snapshot: BoardSnapshot; readonly error: null }
	| { readonly kind: "failure"; readonly snapshot: null; readonly error: string }
	| { readonly kind: "stale"; readonly snapshot: BoardSnapshot; readonly error: string };

export interface LiveBoardSubscription {
	dispose(): void;
}

/** Complete-snapshot refresh state with latest-generation commit ordering. */
export class LiveBoardController {
	private generation = 0;
	private disposed = false;
	private readonly listeners = new Set<(state: LiveBoardState) => void>();
	private current: LiveBoardState = { kind: "loading", snapshot: null, error: null };

	constructor(private readonly source: LiveBoardSource) {}

	get state(): LiveBoardState {
		return this.current;
	}

	subscribe(listener: (state: LiveBoardState) => void): LiveBoardSubscription {
		this.listeners.add(listener);
		listener(this.current);
		return { dispose: () => this.listeners.delete(listener) };
	}

	async refresh(): Promise<void> {
		if (this.disposed) return;
		const generation = ++this.generation;
		const lastGood = this.current.snapshot;
		this.publish(
			lastGood
				? { kind: "refreshing", snapshot: lastGood, error: null }
				: { kind: "loading", snapshot: null, error: null },
		);
		try {
			const snapshot = await this.source.load();
			if (this.disposed || generation !== this.generation) return;
			this.publish({
				kind: hasCards(snapshot) ? "ready" : "empty",
				snapshot,
				error: null,
			});
		} catch (error) {
			if (this.disposed || generation !== this.generation) return;
			const message = error instanceof Error ? error.message : String(error);
			this.publish(
				lastGood
					? { kind: "stale", snapshot: lastGood, error: message }
					: { kind: "failure", snapshot: null, error: message },
			);
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.generation++;
		this.listeners.clear();
	}

	private publish(state: LiveBoardState): void {
		if (this.disposed) return;
		this.current = state;
		for (const listener of this.listeners) listener(state);
	}
}

export interface LiveBoardOptions {
	readonly tui: Pick<TUI, "requestRender"> & { terminal?: { rows: number; columns: number } };
	readonly theme: Theme;
	readonly keybindings?: Pick<KeybindingsManager, "matches">;
	readonly getTheme?: () => Theme;
	readonly source: LiveBoardSource;
	readonly done: (intent: BoardIntent) => void;
	readonly onDispose?: () => void;
}

/** Source-aware shell around the source-neutral board renderer. */
export class LiveBoard {
	readonly controller: LiveBoardController;
	private readonly board: FixtureBoard;
	private readonly subscription: LiveBoardSubscription;
	private readonly activitySubscription: LiveBoardSubscription | undefined;
	private disposed = false;

	constructor(private readonly options: LiveBoardOptions) {
		this.controller = new LiveBoardController(options.source);
		this.board = new FixtureBoard({
			tui: options.tui,
			theme: options.theme,
			...(options.keybindings ? { keybindings: options.keybindings } : {}),
			...(options.getTheme ? { getTheme: options.getTheme } : {}),
			snapshot: placeholderSnapshot(options.source),
			status: liveStatus(this.controller.state, options.source.label),
			onRefresh: () => this.controller.refresh(),
			done: (intent) => {
				this.dispose();
				options.done(intent);
			},
		});
		this.subscription = this.controller.subscribe((state) => {
			if (state.snapshot)
				this.board.replaceSnapshot(options.source.activity?.compose(state.snapshot) ?? state.snapshot);
			this.board.setStatus(liveStatus(state, options.source.label));
		});
		this.activitySubscription = options.source.activity?.subscribe(() => {
			const snapshot = this.controller.state.snapshot;
			if (snapshot) this.board.replaceSnapshot(options.source.activity!.compose(snapshot));
		});
		void this.controller.refresh();
	}

	getFocus(): BoardFocus {
		return this.board.getFocus();
	}

	handleInput(data: string): void {
		this.board.handleInput(data);
	}

	render(width: number): string[] {
		return this.board.render(width);
	}

	invalidate(): void {
		this.board.invalidate();
	}

	cancel(): void {
		this.board.cancel();
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.subscription.dispose();
		this.activitySubscription?.dispose();
		this.controller.dispose();
		this.board.dispose();
		this.options.onDispose?.();
	}
}

function placeholderSnapshot(source: LiveBoardSource): BoardSnapshot {
	return {
		id: `loading:${source.id}`,
		title: source.label,
		columns: [{ id: "loading", label: "Live store", cards: [] }],
	};
}

function hasCards(snapshot: BoardSnapshot): boolean {
	return snapshot.columns.some((column) => column.id !== "specs" && column.cards.length > 0);
}

function noticeSuffix(snapshot: BoardSnapshot): string {
	const notice = snapshot.notices?.[0];
	return notice ? ` · ${notice}` : "";
}

function liveStatus(state: LiveBoardState, label: string): BoardLoadStatus {
	switch (state.kind) {
		case "loading":
			return { kind: "loading", message: `Loading ${label}… Esc/Ctrl+C cancels.` };
		case "refreshing":
			return { kind: "refreshing", message: `Refreshing ${label}… Last good view remains visible.` };
		case "ready":
			return { kind: "ready", message: `Live source: ${label}${noticeSuffix(state.snapshot)} · r refresh` };
		case "empty":
			return {
				kind: "empty",
				message: `Live source: ${label} · empty work board${noticeSuffix(state.snapshot)} · r refresh`,
			};
		case "failure":
			return { kind: "failure", message: `Load failed: ${state.error} · r retry`, retry: true };
		case "stale":
			return { kind: "stale", message: `Stale: ${state.error} · r retry`, retry: true };
	}
}
