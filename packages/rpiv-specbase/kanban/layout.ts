export const MAX_BOARD_ROWS = 18;
export const MAX_BOARD_SHARE = 0.45;
export const MIN_CHAT_ROWS = 8;
export const HOST_CHROME_ROWS = 4;

export interface BoardLayout {
	readonly maxRows: number;
	readonly cardRows: number;
	readonly compact: boolean;
	readonly visibleChatRows: number;
}

/**
 * Reserve transcript and host chrome before allocating the top-anchored board.
 * A small terminal remains explicit compact mode rather than replacing chat.
 */
export function getBoardLayout(terminalRows: number, terminalWidth: number): BoardLayout {
	const rows = Math.max(0, terminalRows);
	const shareCap = Math.floor(rows * MAX_BOARD_SHARE);
	const chatSafeCap = Math.max(0, rows - MIN_CHAT_ROWS - HOST_CHROME_ROWS);
	const maxRows = Math.min(MAX_BOARD_ROWS, shareCap, chatSafeCap);
	const compact = terminalWidth < 88 || maxRows < 10;
	return {
		maxRows,
		cardRows: Math.max(0, maxRows - (compact ? 5 : 7)),
		compact,
		visibleChatRows: Math.max(0, rows - maxRows - HOST_CHROME_ROWS),
	};
}
