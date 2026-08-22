import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { Key, type KeyId, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
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

interface RenderedCard {
	readonly lines: readonly string[];
}

/** Keyboard-only, snapshot-only board. It never reads or writes a source. */
export class FixtureBoard {
	private readonly subscription: BoardSubscription | undefined;
	private disposed = false;
	private stage: BoardStage = "cards";
	private columnIndex = 0;
	private cardIndex: number | undefined;
	private actionIndex = 0;
	private detailOffset = 0;
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
					return this.cell(
						`${focused ? "▶" : " "} ${column.label} (${column.cards.length})`,
						columnWidth,
						focused ? "accent" : "muted",
					);
				})
				.join(gap),
		);

		const actions = this.stage === "actions" ? (this.currentCard?.actions ?? []) : [];
		const blockedDetailRows = this.stage === "actions" && this.currentAction && !this.currentAction.enabled ? 1 : 0;
		const fixedRows = lines.length + 1 + blockedDetailRows;
		const actionRows = actions.length ? Math.min(actions.length, Math.max(1, layout.maxRows - fixedRows - 1)) : 0;
		const detailBudget =
			this.stage === "cards" || !this.currentCard ? 0 : Math.max(0, layout.maxRows - fixedRows - actionRows);
		const allDetailLines = detailBudget ? this.detailLines(this.currentCard!, width) : [];
		const detailStart = Math.min(this.detailOffset, Math.max(0, allDetailLines.length - detailBudget));
		const detailLines = allDetailLines.slice(detailStart, detailStart + detailBudget);
		const cardBudget = this.stage === "cards" ? Math.max(0, layout.maxRows - fixedRows) : 0;
		const columnLines = visibleColumns.map((column) =>
			this.visibleCardLines(
				column.cards,
				column.id === focus.columnId ? this.cardIndex : undefined,
				columnWidth,
				cardBudget,
			),
		);
		const populatedCardRows = Math.max(0, ...columnLines.map((column) => column.length));
		for (let row = 0; row < populatedCardRows; row++) {
			add(
				columnLines
					.map((column, index) => {
						const line = column[row];
						const focusedColumn = visibleColumns[index]!.id === focus.columnId;
						return this.cell(line?.text ?? "", columnWidth, focusedColumn && line?.focused ? "accent" : "text");
					})
					.join(gap),
			);
		}
		for (const detail of detailLines) add(theme.fg("muted", detail));
		if (actions.length) {
			const start = Math.min(
				Math.max(0, this.actionIndex - actionRows + 1),
				Math.max(0, actions.length - actionRows),
			);
			for (let index = start; index < start + actionRows; index++) {
				const action = actions[index]!;
				const focusedAction = index === this.actionIndex;
				add(
					theme.fg(
						focusedAction ? "accent" : action.enabled ? "text" : "dim",
						` ${focusedAction ? "›" : " "} ${action.label}${action.enabled ? "" : " (blocked)"}`,
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
		this.detailOffset = 0;
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
			this.detailOffset = 0;
			this.changed();
		}
	}

	private handleDetailInput(data: string): void {
		if (matchesKey(data, Key.left) || data === "h") {
			this.stage = "cards";
			this.detailOffset = 0;
			this.changed();
		} else if (this.matches(data, "tui.select.up", [Key.up]) || data === "k") {
			this.detailOffset = Math.max(0, this.detailOffset - 1);
			this.changed();
		} else if (this.matches(data, "tui.select.down", [Key.down]) || data === "j") {
			this.detailOffset += 1;
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

	private visibleCardLines(
		cards: readonly BoardCard[],
		focusedIndex: number | undefined,
		width: number,
		budget: number,
	): Array<{ text: string; focused: boolean }> {
		if (budget <= 0) return [];
		const rendered = cards.map(
			(card, index): RenderedCard => ({
				lines: this.cardLines(card, index === focusedIndex, width),
			}),
		);
		let start = 0;
		if (focusedIndex !== undefined && rendered[focusedIndex]) {
			start = focusedIndex;
			let used = rendered[focusedIndex]!.lines.length;
			while (start > 0 && used + rendered[start - 1]!.lines.length <= budget) {
				start -= 1;
				used += rendered[start]!.lines.length;
			}
		}
		const rows: Array<{ text: string; focused: boolean }> = [];
		for (let index = start; index < rendered.length; index++) {
			const entry = rendered[index]!;
			if (rows.length && rows.length + entry.lines.length > budget) break;
			for (const text of entry.lines) rows.push({ text, focused: index === focusedIndex });
			if (rows.length >= budget) break;
		}
		return rows;
	}

	private cardLines(card: BoardCard, focused: boolean, width: number): readonly string[] {
		const prefix = `${focused ? "›" : " "} `;
		const continuation = "  ";
		const titleWidth = Math.max(1, width - visibleWidth(continuation));
		const wrapped = wrapTextWithAnsi(card.title, titleWidth);
		const safeWrapped = /\u001b\[/u.test(card.title)
			? wrapped
			: wrapped.map((line) => line.replaceAll("\u001b[0m", ""));
		const titleLines =
			safeWrapped.length > 2
				? [safeWrapped[0]!, truncateToWidth(`${safeWrapped[1]!}…`, titleWidth, "…")]
				: safeWrapped.length
					? safeWrapped
					: [""];
		const rail =
			card.stack && card.stackLabel ? `┊ ${card.stack.position}/${card.stack.total} ${card.stackLabel}` : undefined;
		const metadata = [card.activity, rail].filter((value): value is string => Boolean(value));
		if (!metadata.length) return titleLines.map((line, index) => `${index === 0 ? prefix : continuation}${line}`);
		return [
			...metadata.map((line, index) => `${index === 0 ? prefix : continuation}${line}`),
			...titleLines.map((line) => `${continuation}${line}`),
		];
	}

	private detailLines(card: BoardCard, width: number): readonly string[] {
		const detail = [` ${card.title}: ${card.summary}`];
		if (card.activityDetail) detail.push(` Activity: ${card.activityDetail}`);
		if (card.stack)
			detail.push(` Stack: ${card.stackLabel ?? card.stack.id} ${card.stack.position}/${card.stack.total}`);
		if (card.stackContext) detail.push(` Stack context: ${JSON.stringify(card.stackContext)}`);
		return detail.flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
	}

	private cell(text: string, width: number, color: "accent" | "muted" | "text" | "dim"): string {
		const clipped = truncateToWidth(text, width, "…");
		const safe = /\u001b\[/u.test(text) ? clipped : clipped.replaceAll("\u001b[0m", "");
		const padding = " ".repeat(Math.max(0, width - visibleWidth(safe)));
		return `${this.theme.fg(color, safe)}${padding}`;
	}

	private helpText(): string {
		const refresh = this.options.onRefresh ? " · r refresh" : "";
		if (this.stage === "cards")
			return ` Esc/Ctrl+C cancel${refresh} · h/l or ←/→ columns · j/k or ↑/↓ cards · Enter detail`;
		if (this.stage === "detail")
			return this.currentCard?.actions.length
				? ` Esc/Ctrl+C cancel${refresh} · j/k or ↑/↓ detail · h/← back · Enter actions`
				: ` Esc/Ctrl+C cancel${refresh} · j/k or ↑/↓ detail · h/← back · no actions in this snapshot`;
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
