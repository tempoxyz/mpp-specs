/**
 * Tetris Game Engine
 *
 * A proper Tetris implementation that renders to CHIP-8 display format (64x32).
 * Supports all 7 tetrominos, collision detection, line clearing, and game over.
 */

export const DISPLAY_WIDTH = 64
export const DISPLAY_HEIGHT = 32

// Game board dimensions (in cells, not pixels)
// Each cell is 2x2 pixels for visibility
// CHIP-8 display is 64x32, so max height is (32-2)/2 = 15 cells
const BOARD_WIDTH = 10
const BOARD_HEIGHT = 15
const CELL_SIZE = 2

// Board position on display (centered horizontally)
const BOARD_X = Math.floor((DISPLAY_WIDTH - BOARD_WIDTH * CELL_SIZE) / 2)
const BOARD_Y = 1

// The 7 tetromino shapes (I, O, T, S, Z, J, L)
// Each shape has 4 rotations, each rotation is a 4x4 grid
const TETROMINOS: Record<string, number[][][]> = {
	I: [
		[
			[0, 0, 0, 0],
			[1, 1, 1, 1],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 0, 1, 0],
			[0, 0, 1, 0],
			[0, 0, 1, 0],
			[0, 0, 1, 0],
		],
		[
			[0, 0, 0, 0],
			[0, 0, 0, 0],
			[1, 1, 1, 1],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 1, 0, 0],
		],
	],
	O: [
		[
			[0, 1, 1, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 1, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 1, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 1, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
	],
	T: [
		[
			[0, 1, 0, 0],
			[1, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 0, 0],
			[0, 1, 1, 0],
			[0, 1, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 0, 0, 0],
			[1, 1, 1, 0],
			[0, 1, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 0, 0],
			[1, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 0, 0],
		],
	],
	S: [
		[
			[0, 1, 1, 0],
			[1, 1, 0, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 0, 0],
			[0, 1, 1, 0],
			[0, 0, 1, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 0, 0, 0],
			[0, 1, 1, 0],
			[1, 1, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[1, 0, 0, 0],
			[1, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 0, 0],
		],
	],
	Z: [
		[
			[1, 1, 0, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 0, 1, 0],
			[0, 1, 1, 0],
			[0, 1, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 0, 0, 0],
			[1, 1, 0, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 0, 0],
			[1, 1, 0, 0],
			[1, 0, 0, 0],
			[0, 0, 0, 0],
		],
	],
	J: [
		[
			[1, 0, 0, 0],
			[1, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 1, 0],
			[0, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 0, 0, 0],
			[1, 1, 1, 0],
			[0, 0, 1, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 0, 0],
			[0, 1, 0, 0],
			[1, 1, 0, 0],
			[0, 0, 0, 0],
		],
	],
	L: [
		[
			[0, 0, 1, 0],
			[1, 1, 1, 0],
			[0, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 1, 1, 0],
			[0, 0, 0, 0],
		],
		[
			[0, 0, 0, 0],
			[1, 1, 1, 0],
			[1, 0, 0, 0],
			[0, 0, 0, 0],
		],
		[
			[1, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 1, 0, 0],
			[0, 0, 0, 0],
		],
	],
}

const TETROMINO_TYPES = Object.keys(TETROMINOS)

export type TetrisAction = 'left' | 'right' | 'rotate' | 'drop'

export interface TetrisState {
	board: number[][] // The placed pieces (BOARD_HEIGHT x BOARD_WIDTH)
	currentPiece: {
		type: string
		rotation: number
		x: number
		y: number
	} | null
	nextPiece: string
	score: number
	linesCleared: number
	gameOver: boolean
	seed: number // For deterministic random
}

export interface GameMetadata {
	moveCount: number
	linesCleared: number
	lastMove: string
	lastMoveBy?: string
}

/** Simple seeded random number generator */
function seededRandom(seed: number): { value: number; nextSeed: number } {
	const next = (seed * 1103515245 + 12345) & 0x7fffffff
	return { value: next / 0x7fffffff, nextSeed: next }
}

/** Get a random tetromino type using the seeded RNG */
function getRandomPiece(seed: number): { type: string; nextSeed: number } {
	const { value, nextSeed } = seededRandom(seed)
	const index = Math.floor(value * TETROMINO_TYPES.length)
	return { type: TETROMINO_TYPES[index] ?? 'T', nextSeed }
}

/** Create a new empty board */
function createEmptyBoard(): number[][] {
	return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0))
}

/** Initialize a new game */
export function initializeGame(seed?: number): TetrisState {
	const initialSeed = seed ?? Date.now()
	const { type: firstPiece, nextSeed: seed2 } = getRandomPiece(initialSeed)
	const { type: nextPiece, nextSeed: seed3 } = getRandomPiece(seed2)

	return {
		board: createEmptyBoard(),
		currentPiece: {
			type: firstPiece,
			rotation: 0,
			x: Math.floor(BOARD_WIDTH / 2) - 2,
			y: 0,
		},
		nextPiece,
		score: 0,
		linesCleared: 0,
		gameOver: false,
		seed: seed3,
	}
}

/** Get the shape grid for a piece at a given rotation */
function getPieceShape(type: string, rotation: number): number[][] {
	const shapes = TETROMINOS[type]
	if (!shapes) return TETROMINOS.T![0]!
	return shapes[rotation % 4] ?? shapes[0]!
}

/** Check if a piece can be placed at the given position */
function canPlace(
	board: number[][],
	type: string,
	rotation: number,
	x: number,
	y: number,
): boolean {
	const shape = getPieceShape(type, rotation)

	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 4; col++) {
			if (shape[row]?.[col]) {
				const boardX = x + col
				const boardY = y + row

				// Check bounds
				if (boardX < 0 || boardX >= BOARD_WIDTH) return false
				if (boardY >= BOARD_HEIGHT) return false

				// Check collision with placed pieces (ignore if above board)
				if (boardY >= 0 && board[boardY]?.[boardX]) return false
			}
		}
	}

	return true
}

/** Place the current piece on the board */
function placePiece(state: TetrisState): TetrisState {
	if (!state.currentPiece) return state

	const { type, rotation, x, y } = state.currentPiece
	const shape = getPieceShape(type, rotation)
	const newBoard = state.board.map((row) => [...row])

	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 4; col++) {
			if (shape[row]?.[col]) {
				const boardX = x + col
				const boardY = y + row
				if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
					newBoard[boardY]![boardX] = 1
				}
			}
		}
	}

	return { ...state, board: newBoard }
}

/** Clear completed lines and return the new board + lines cleared */
function clearLines(board: number[][]): { board: number[][]; cleared: number } {
	const newBoard: number[][] = []
	let cleared = 0

	// Keep non-complete lines
	for (let row = 0; row < BOARD_HEIGHT; row++) {
		const line = board[row]
		if (line && !line.every((cell) => cell === 1)) {
			newBoard.push([...line])
		} else {
			cleared++
		}
	}

	// Add empty lines at the top
	while (newBoard.length < BOARD_HEIGHT) {
		newBoard.unshift(Array(BOARD_WIDTH).fill(0))
	}

	return { board: newBoard, cleared }
}

/** Spawn a new piece */
function spawnPiece(state: TetrisState): TetrisState {
	const { type: newNext, nextSeed } = getRandomPiece(state.seed)

	const newPiece = {
		type: state.nextPiece,
		rotation: 0,
		x: Math.floor(BOARD_WIDTH / 2) - 2,
		y: 0,
	}

	// Check if game over (can't place new piece) - auto restart!
	if (!canPlace(state.board, newPiece.type, newPiece.rotation, newPiece.x, newPiece.y)) {
		// Game over - restart with a fresh game, preserving the seed for continuity
		return initializeGame(nextSeed)
	}

	return {
		...state,
		currentPiece: newPiece,
		nextPiece: newNext,
		seed: nextSeed,
	}
}

/** Execute a move */
export function executeMove(state: TetrisState, action: TetrisAction): TetrisState {
	if (!state.currentPiece) {
		// No current piece - reinitialize the game
		return initializeGame(state.seed)
	}

	const { type, rotation, x, y } = state.currentPiece

	switch (action) {
		case 'left': {
			if (canPlace(state.board, type, rotation, x - 1, y)) {
				return {
					...state,
					currentPiece: { ...state.currentPiece, x: x - 1 },
				}
			}
			return state
		}

		case 'right': {
			if (canPlace(state.board, type, rotation, x + 1, y)) {
				return {
					...state,
					currentPiece: { ...state.currentPiece, x: x + 1 },
				}
			}
			return state
		}

		case 'rotate': {
			const newRotation = (rotation + 1) % 4
			// Try basic rotation
			if (canPlace(state.board, type, newRotation, x, y)) {
				return {
					...state,
					currentPiece: { ...state.currentPiece, rotation: newRotation },
				}
			}
			// Wall kick: try moving left/right
			for (const offset of [-1, 1, -2, 2]) {
				if (canPlace(state.board, type, newRotation, x + offset, y)) {
					return {
						...state,
						currentPiece: { ...state.currentPiece, rotation: newRotation, x: x + offset },
					}
				}
			}
			return state
		}

		case 'drop': {
			// Find the lowest valid position
			let dropY = y
			while (canPlace(state.board, type, rotation, x, dropY + 1)) {
				dropY++
			}

			// Place the piece
			let newState: TetrisState = {
				...state,
				currentPiece: { type, rotation, x, y: dropY },
			}
			newState = placePiece(newState)

			// Clear lines
			const { board: clearedBoard, cleared } = clearLines(newState.board)
			newState = {
				...newState,
				board: clearedBoard,
				linesCleared: state.linesCleared + cleared,
				score: state.score + cleared * 100 + 10, // Points for lines + drop
			}

			// Spawn new piece
			newState = spawnPiece(newState)

			return newState
		}

		default:
			return state
	}
}

/** Render the game state to a display buffer (64x32 pixels) */
export function renderToDisplay(state: TetrisState): number[] {
	const display = new Array(DISPLAY_WIDTH * DISPLAY_HEIGHT).fill(0)

	// Ensure board exists
	if (!state.board || !Array.isArray(state.board)) {
		console.error('Invalid game state: board is missing or invalid')
		return display
	}

	// Helper to set a pixel
	const setPixel = (x: number, y: number, value: number) => {
		if (x >= 0 && x < DISPLAY_WIDTH && y >= 0 && y < DISPLAY_HEIGHT) {
			display[y * DISPLAY_WIDTH + x] = value
		}
	}

	// Draw border
	// Left border
	for (let y = BOARD_Y - 1; y <= BOARD_Y + BOARD_HEIGHT * CELL_SIZE; y++) {
		setPixel(BOARD_X - 1, y, 1)
	}
	// Right border
	for (let y = BOARD_Y - 1; y <= BOARD_Y + BOARD_HEIGHT * CELL_SIZE; y++) {
		setPixel(BOARD_X + BOARD_WIDTH * CELL_SIZE, y, 1)
	}
	// Bottom border
	for (let x = BOARD_X - 1; x <= BOARD_X + BOARD_WIDTH * CELL_SIZE; x++) {
		setPixel(x, BOARD_Y + BOARD_HEIGHT * CELL_SIZE, 1)
	}

	// Draw placed pieces on board
	for (let row = 0; row < BOARD_HEIGHT; row++) {
		for (let col = 0; col < BOARD_WIDTH; col++) {
			if (state.board[row]?.[col]) {
				// Draw a 2x2 cell
				const px = BOARD_X + col * CELL_SIZE
				const py = BOARD_Y + row * CELL_SIZE
				for (let dy = 0; dy < CELL_SIZE; dy++) {
					for (let dx = 0; dx < CELL_SIZE; dx++) {
						setPixel(px + dx, py + dy, 1)
					}
				}
			}
		}
	}

	// Draw current piece
	if (state.currentPiece) {
		const { type, rotation, x, y } = state.currentPiece
		const shape = getPieceShape(type, rotation)

		for (let row = 0; row < 4; row++) {
			for (let col = 0; col < 4; col++) {
				if (shape[row]?.[col]) {
					const boardX = x + col
					const boardY = y + row
					if (boardY >= 0) {
						const px = BOARD_X + boardX * CELL_SIZE
						const py = BOARD_Y + boardY * CELL_SIZE
						for (let dy = 0; dy < CELL_SIZE; dy++) {
							for (let dx = 0; dx < CELL_SIZE; dx++) {
								setPixel(px + dx, py + dy, 1)
							}
						}
					}
				}
			}
		}
	}

	// Draw "next piece" preview on the right side
	const nextShape = getPieceShape(state.nextPiece, 0)
	const previewX = BOARD_X + BOARD_WIDTH * CELL_SIZE + 4
	const previewY = 4

	// Draw "NEXT" label area border
	for (let x = previewX - 1; x <= previewX + 8; x++) {
		setPixel(x, previewY - 1, 1)
		setPixel(x, previewY + 8, 1)
	}
	for (let y = previewY - 1; y <= previewY + 8; y++) {
		setPixel(previewX - 1, y, 1)
		setPixel(previewX + 8, y, 1)
	}

	// Draw next piece
	for (let row = 0; row < 4; row++) {
		for (let col = 0; col < 4; col++) {
			if (nextShape[row]?.[col]) {
				const px = previewX + col * 2
				const py = previewY + row * 2
				for (let dy = 0; dy < 2; dy++) {
					for (let dx = 0; dx < 2; dx++) {
						setPixel(px + dx, py + dy, 1)
					}
				}
			}
		}
	}

	return display
}

/** Render display as ASCII art */
export function renderAscii(display: number[]): string {
	const lines: string[] = []
	for (let y = 0; y < DISPLAY_HEIGHT; y++) {
		let line = ''
		for (let x = 0; x < DISPLAY_WIDTH; x++) {
			const pixel = display[y * DISPLAY_WIDTH + x]
			line += pixel ? '█' : ' '
		}
		lines.push(line)
	}
	return lines.join('\n')
}

/** Serialize game state for storage */
export function serializeState(state: TetrisState): string {
	return JSON.stringify(state)
}

/** Deserialize game state from storage */
export function deserializeState(json: string): TetrisState {
	const parsed = JSON.parse(json) as TetrisState

	// Ensure board is properly initialized
	if (!parsed.board || !Array.isArray(parsed.board)) {
		console.warn('Invalid state detected, reinitializing board')
		parsed.board = createEmptyBoard()
	}

	return parsed
}
