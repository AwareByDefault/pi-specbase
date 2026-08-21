import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { Key, type KeyId, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getBoardLayout } from "./layout.js";
import type { BoardAction, BoardCard, BoardIntent, BoardLoadStatus, BoardSnapshot } from "./types.js";

export type BoardStage = "cards" | "detail" | "actions";

export interface BoardSubscription {
	dispose(): void;
}

export interface FixtureBoardOptions {
	readonly tui: Pick<TUI, "requestRender"> & { terminal?: { rows: number; columns: number } };
	readonly theme: Theme;
	readonly keybindings?: Pick<KeybindingsManager, "matches">;
	/** Reads the current Pi theme at render time after a host invalidation. */
	readonly getTheme?: () => Theme;
	readonly snapshot: BoardSnapshot;
	readonly done: (intent: BoardIntent) => void;
	readonly subscribe?: (onInvalidate: () => void) => BoardSubscription;
	readonly onRefresh?: () => void | Promise<void>;
	readonly status?: BoardLoadStatus;
	readonly onDispose?: () => void;
}

export interface BoardFocus {
	readonly stage: BoardStage;
	readonly columnId: string;
	readonly cardId?: string;
	readonly actionId?: string;
}

/** Keyboard-only, snapshot-only board. It never reads or writes a source. */
export class FixtureBoard {
	private readonly subscription: BoardSubscription | undefined;
	private disposed = false;
	private stage: BoardStage = "cards";
	private columnIndex = 0;
	private cardIndex: number | undefined;
	private actionIndex = 0;
	private snapshot: BoardSnapshot;
	private status: BoardLoadStatus | undefined;

	constructor(private readonly options: FixtureBoardOptions) {
		this.snapshot = options.snapshot;
		this.status = options.status;
		this.cardIndex = this.currentColumn.cards.length > 0 ? 0 : undefined;
		this.subscription = options.subscribe?.(() => this.changed());
	}

	getFocus(): BoardFocus {
		const card = this.currentCard;
		return {
			stage: this.stage,
			columnId: this.currentColumn.id,
			...(card ? { cardId: card.id } : {}),
			...(this.stage === "actions" && this.currentAction ? { actionId: this.currentAction.id } : {}),
		};
	}

	handleInput(data: string): void {
		if (this.matches(data, "tui.select.cancel", [Key.escape, Key.ctrl("c")])) {
			this.close({ kind: "cancelled" });
			return;
		}
		if (data === "r" && this.options.onRefresh) {
			void this.options.onRefresh();
			return;
		}

		if (this.stage === "cards") this.handleCardInput(data);
		else if (this.stage === "detail") this.handleDetailInput(data);
		else this.handleActionInput(data);
	}

	render(width: number): string[] {
		const terminal = this.options.tui.terminal;
		const layout = getBoardLayout(terminal?.rows ?? 40, terminal?.columns ?? width);
		if (layout.maxRows === 0 || width <= 0) return [];

		const lines: string[] = [];
		const add = (line: string) => lines.push(truncateToWidth(line, width, "…"));
		const theme = this.theme;
		const focus = this.getFocus();
		add(
			theme.fg(
				"accent",
				theme.bold(` Specbase kanban · ${this.snapshot.title}${layout.compact ? " · compact" : ""}`),
			),
		);
		if (this.status) {
			const color = this.status.kind === "failure" || this.status.kind === "stale" ? "warning" : "muted";
			add(theme.fg(color, ` ${this.status.message}`));
		}
		if (layout.maxRows < 6) {
			add(theme.fg("warning", " Esc/Ctrl+C cancel · terminal too short"));
			return lines.slice(0, layout.maxRows);
		}

		const visibleColumns = this.columnsForWidth(width, layout.compact);
		const gap = theme.fg("border", " │ ");
		const columnWidth = Math.max(
			1,
			Math.floor((width - visibleWidth(gap) * (visibleColumns.length - 1)) / visibleColumns.length),
		);
		add(
			visibleColumns
				.map((column) => {
					const focused = column.id === focus.columnId;
					const label = `${focused ? "▶" : " "} ${column.label} (${column.cards.length})`;
					return this.cell(label, columnWidth, focused ? "accent" : "muted");
				})
				.join(gap),
		);

		const statusRows = this.status ? 1 : 0;
		const detailRows = this.stage === "cards" || !this.currentCard ? 0 : 1;
		const blockedDetailRows = this.stage === "actions" && this.currentAction && !this.currentAction.enabled ? 1 : 0;
		const actions = this.stage === "actions" ? (this.currentCard?.actions ?? []) : [];
		const actionRows = actions.length
			? Math.max(1, Math.min(actions.length, layout.maxRows - 3 - statusRows - detailRows - blockedDetailRows))
			: 0;
		const cardRows = Math.max(0, layout.maxRows - 3 - statusRows - detailRows - blockedDetailRows - actionRows);

		for (let row = 0; row < cardRows; row++) {
			const rowText = visibleColumns
				.map((column) => {
					const focusedColumn = column.id === focus.columnId;
					const start =
						focusedColumn && this.cardIndex !== undefined
							? Math.min(Math.max(0, this.cardIndex - cardRows + 1), Math.max(0, column.cards.length - cardRows))
							: 0;
					const index = start + row;
					const card = column.cards[index];
					if (!card) return this.cell("", columnWidth, "dim");
					const focusedCard = focusedColumn && this.cardIndex === index;
					return this.cell(
						`${focusedCard ? "›" : " "} ${card.activity ? `${card.activity} · ` : ""}${card.title}`,
						columnWidth,
						focusedCard ? "accent" : "text",
					);
				})
				.join(gap);
			add(rowText);
		}

		if (detailRows && this.currentCard) {
			add(theme.fg("muted", ` ${this.currentCard.title}: ${this.currentCard.summary}`));
		}
		if (actions.length) {
			const start = Math.min(
				Math.max(0, this.actionIndex - actionRows + 1),
				Math.max(0, actions.length - actionRows),
			);
			for (let index = start; index < start + actionRows; index++) {
				const action = actions[index]!;
				const focusedAction = index === this.actionIndex;
				const enabled = action.enabled ? "" : " (blocked)";
				add(
					theme.fg(
						focusedAction ? "accent" : action.enabled ? "text" : "dim",
						` ${focusedAction ? "›" : " "} ${action.label}${enabled}`,
					),
				);
			}
		}
		if (blockedDetailRows && this.currentAction) {
			add(theme.fg("warning", ` Blocked: ${this.currentAction.detail ?? "This action is currently unavailable."}`));
		}
		add(theme.fg("dim", this.helpText()));
		return lines.slice(0, layout.maxRows);
	}

	invalidate(): void {
		// Rendering is derived from the current snapshot and active theme each time.
	}

	setStatus(status: BoardLoadStatus | undefined): void {
		this.status = status;
		this.changed();
	}

	/** Atomically replace presentation data and reconcile focus by stable card identity. */
	replaceSnapshot(snapshot: BoardSnapshot): void {
		const selectedId = this.currentCard?.id;
		const selectedColumnId = this.currentColumn.id;
		const selectedCardIndex = this.cardIndex ?? 0;
		const selectedActionId = this.currentAction?.id;
		this.snapshot = snapshot;

		const matchingColumnIndex = selectedId
			? snapshot.columns.findIndex((column) => column.cards.some((card) => card.id === selectedId))
			: -1;
		if (matchingColumnIndex >= 0 && selectedId) {
			this.columnIndex = matchingColumnIndex;
			this.cardIndex = snapshot.columns[matchingColumnIndex]!.cards.findIndex((card) => card.id === selectedId);
			const actions = this.currentCard?.actions ?? [];
			const matchingActionIndex = selectedActionId
				? actions.findIndex((action) => action.id === selectedActionId)
				: -1;
			if (this.stage === "actions" && matchingActionIndex < 0) this.stage = actions.length > 0 ? "detail" : "cards";
			this.actionIndex = Math.max(0, matchingActionIndex);
			this.changed();
			return;
		}

		const sameColumnIndex = snapshot.columns.findIndex((column) => column.id === selectedColumnId);
		if (sameColumnIndex >= 0 && snapshot.columns[sameColumnIndex]!.cards.length > 0) {
			this.columnIndex = sameColumnIndex;
			this.cardIndex = Math.min(selectedCardIndex, snapshot.columns[sameColumnIndex]!.cards.length - 1);
		} else {
			const firstPopulatedColumn = snapshot.columns.findIndex((column) => column.cards.length > 0);
			this.columnIndex = firstPopulatedColumn >= 0 ? firstPopulatedColumn : Math.max(0, sameColumnIndex);
			this.cardIndex = firstPopulatedColumn >= 0 ? 0 : undefined;
		}
		this.stage = "cards";
		this.actionIndex = 0;
		this.changed();
	}

	cancel(): void {
		this.close({ kind: "cancelled" });
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.subscription?.dispose();
		this.options.onDispose?.();
	}

	private get theme(): Theme {
		return this.options.getTheme?.() ?? this.options.theme;
	}

	private get currentColumn() {
		return this.snapshot.columns[this.columnIndex]!;
	}

	private get currentCard(): BoardCard | undefined {
		return this.cardIndex === undefined ? undefined : this.currentColumn.cards[this.cardIndex];
	}

	private get currentAction(): BoardAction | undefined {
		return this.currentCard?.actions[this.actionIndex];
	}

	private handleCardInput(data: string): void {
		if (matchesKey(data, Key.left) || data === "h") this.moveColumn(-1);
		else if (matchesKey(data, Key.right) || data === "l") this.moveColumn(1);
		else if (this.matches(data, "tui.select.up", [Key.up]) || data === "k") this.moveCard(-1);
		else if (this.matches(data, "tui.select.down", [Key.down]) || data === "j") this.moveCard(1);
		else if (this.isConfirm(data) && this.currentCard) {
			this.stage = "detail";
			this.changed();
		}
	}

	private handleDetailInput(data: string): void {
		if (matchesKey(data, Key.left) || data === "h") {
			this.stage = "cards";
			this.changed();
		} else if (this.isConfirm(data) && this.currentCard?.actions.length) {
			this.stage = "actions";
			this.actionIndex = 0;
			this.changed();
		}
	}

	private handleActionInput(data: string): void {
		if (matchesKey(data, Key.left) || data === "h") {
			this.stage = "detail";
			this.changed();
		} else if (this.matches(data, "tui.select.up", [Key.up]) || data === "k") this.moveAction(-1);
		else if (this.matches(data, "tui.select.down", [Key.down]) || data === "j") this.moveAction(1);
		else if (this.isConfirm(data) && this.currentCard && this.currentAction?.enabled) {
			this.close({
				kind: "selected",
				cardId: this.currentCard.id,
				actionId: this.currentAction.id,
				...(this.currentAction.selection ? { selection: this.currentAction.selection } : {}),
			});
		} else if (this.isConfirm(data) && this.currentAction && !this.currentAction.enabled) {
			this.changed();
		}
	}

	private moveColumn(delta: number): void {
		const next = Math.max(0, Math.min(this.snapshot.columns.length - 1, this.columnIndex + delta));
		if (next === this.columnIndex) return;
		this.columnIndex = next;
		this.cardIndex =
			this.currentColumn.cards.length > 0
				? Math.min(this.cardIndex ?? 0, this.currentColumn.cards.length - 1)
				: undefined;
		this.changed();
	}

	private moveCard(delta: number): void {
		if (this.cardIndex === undefined) return;
		const next = Math.max(0, Math.min(this.currentColumn.cards.length - 1, this.cardIndex + delta));
		if (next === this.cardIndex) return;
		this.cardIndex = next;
		this.changed();
	}

	private moveAction(delta: number): void {
		const actions = this.currentCard?.actions ?? [];
		const next = Math.max(0, Math.min(actions.length - 1, this.actionIndex + delta));
		if (next === this.actionIndex) return;
		this.actionIndex = next;
		this.changed();
	}

	private columnsForWidth(width: number, compact: boolean) {
		const columns = this.snapshot.columns;
		const count = compact ? 1 : Math.max(1, Math.min(columns.length, Math.floor(Math.max(1, width) / 24)));
		const start = Math.min(Math.max(0, this.columnIndex - count + 1), Math.max(0, columns.length - count));
		return columns.slice(start, start + count);
	}

	private cell(text: string, width: number, color: "accent" | "muted" | "text" | "dim"): string {
		const clipped = truncateToWidth(text, width, "…");
		const padding = " ".repeat(Math.max(0, width - visibleWidth(clipped)));
		return `${this.theme.fg(color, clipped)}${padding}`;
	}

	private helpText(): string {
		const refresh = this.options.onRefresh ? " · r refresh" : "";
		if (this.stage === "cards")
			return ` Esc/Ctrl+C cancel${refresh} · h/l or ←/→ columns · j/k or ↑/↓ cards · Enter detail`;
		if (this.stage === "detail")
			return this.currentCard?.actions.length
				? ` Esc/Ctrl+C cancel${refresh} · h/← back · Enter actions`
				: ` Esc/Ctrl+C cancel${refresh} · h/← back · no actions in this snapshot`;
		if (this.currentAction && !this.currentAction.enabled)
			return ` Esc/Ctrl+C cancel${refresh} · Blocked — reason above · j/k or ↑/↓ actions · h/← back`;
		return ` Esc/Ctrl+C cancel${refresh} · j/k or ↑/↓ actions · Enter select · h/← back`;
	}

	private isConfirm(data: string): boolean {
		return (
			this.matches(data, "tui.select.confirm", [Key.enter]) ||
			this.options.keybindings?.matches(data, "tui.input.submit") === true
		);
	}

	private matches(
		data: string,
		action: "tui.select.cancel" | "tui.select.up" | "tui.select.down" | "tui.select.confirm",
		fallback: KeyId[],
	): boolean {
		return this.options.keybindings?.matches(data, action) === true || fallback.some((key) => matchesKey(data, key));
	}

	private changed(): void {
		if (!this.disposed) this.options.tui.requestRender();
	}

	private close(intent: BoardIntent): void {
		if (this.disposed) return;
		this.changed();
		this.dispose();
		this.options.done(intent);
	}
}
