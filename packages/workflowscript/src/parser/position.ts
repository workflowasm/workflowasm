// These are used when `options.locations` is on, for the
// `startLoc` and `endLoc` properties.
export class Position {
  line: number
  column: number
  index: number

  constructor(line: number, col: number, index: number) {
    this.line = line
    this.column = col
    this.index = index
  }
}

export function buildPosition(pos: number, lineStart: number, curLine: number) {
  return new Position(curLine, pos - lineStart, pos)
}

export class SourceLocation {
  start: Position
  end: Position
  filename?: string
  identifierName: string | undefined | null

  constructor(start: Position, end?: Position) {
    this.start = start
    //@ts-expect-error (may start as null, but be initialized later)
    this.end = end
  }
}

/**
 * creates a new position with a non-zero column offset from the given position.
 * This function should be only be used when we create AST node out of the token
 * boundaries, such as TemplateElement ends before tt.templateNonTail. This
 * function does not skip whitespaces.
 */
export function createPositionWithColumnOffset(
  position: Position,
  columnOffset: number
) {
  const { line, column, index } = position
  return new Position(line, column + columnOffset, index + columnOffset)
}

export type LineBasedPosition = {
  pos: number
  lineStart: number
  curLine: number
}
