import type * as N from "../ast.ts"
import type { CommentWhitespace, TokenType } from "../ast.ts"
import { Position } from "./position.js"

import { tt, ct, TokContext } from "./token-types.js"
import type { ParseError } from "./error.ts"

export default class State {
  curLine: number
  lineStart: number

  // And, if locations are used, the {line, column} object
  // corresponding to those offsets
  startLoc: Position
  endLoc: Position

  constructor(startLine?: number, startColumn?: number) {
    this.curLine = startLine ?? 0
    this.lineStart = startColumn != null ? -startColumn : 0
    this.startLoc = this.endLoc = new Position(
      this.curLine,
      startColumn ?? 0,
      0
    )
  }

  // init({
  //   startLine,
  //   startColumn
  // }: {
  //   startLine?: number
  //   startColumn?: number
  // }): void {
  //   this.curLine = startLine ?? 0
  //   this.lineStart = startColumn != null ? -startColumn : 0
  //   this.startLoc = this.endLoc = new Position(
  //     this.curLine,
  //     startColumn ?? 0,
  //     0
  //   )
  // }

  errors: ParseError<unknown>[] = []

  // Flags to track
  inType: boolean = false
  noAnonFunctionType: boolean = false
  isAmbientContext: boolean = false
  inAbstractClass: boolean = false
  inDisallowConditionalTypesContext: boolean = false

  // Labels in scope.
  labels: Array<{
    kind: "loop" | "switch" | undefined | null
    name?: string | null
    statementStart?: number
  }> = []

  // Comment store for Program.comments
  comments: Array<N.Comment> = []

  // Comment attachment store
  commentStack: Array<CommentWhitespace> = []

  // The current position of the tokenizer in the input.
  pos: number = 0

  // Properties of the current token:
  // Its type
  type: TokenType = tt.eof

  // For tokens that include more information than their type, the value
  value: unknown = null

  // Its start and end offset
  start: number = 0
  end: number = 0

  // Position information for the previous token
  // this is initialized when generating the second token.
  lastTokEndLoc?: Position
  // this is initialized when generating the second token.
  lastTokStartLoc?: Position
  lastTokStart: number = 0

  // The context stack is used to track whether the apostrophe "`" starts
  // or ends a string template
  context: TokContext[] = [ct.brace]

  // Used to signal to callers of `readWord1` whether the word
  // contained any escape sequences. This is needed because words with
  // escape sequences must not be interpreted as keywords.
  containsEsc: boolean = false

  // Used to track invalid escape sequences in template literals,
  // that must be reported if the template is not tagged.
  firstInvalidTemplateEscapePos: null | Position = null

  // Tokens length in token store
  tokensLength: number = 0

  curPosition(): Position {
    return new Position(this.curLine, this.pos - this.lineStart, this.pos)
  }

  clone(skipArrays: boolean = false): State {
    const state = new State()
    const keys = Object.keys(this) as (keyof State)[]
    for (let i = 0, length = keys.length; i < length; i++) {
      const key = keys[i]
      let val = this[key]

      if (!skipArrays && Array.isArray(val)) {
        val = val.slice()
      }

      // @ts-expect-error val must conform to S[key]
      state[key] = val
    }

    return state
  }
}

export type LookaheadState = {
  pos: number
  value: unknown
  type: TokenType
  start: number
  end: number
  context: TokContext[]
  startLoc: Position
  lastTokEndLoc?: Position
  curLine: number
  lineStart: number
  curPosition: () => Position
  /* Used only in readToken_mult_modulo */
  inType: boolean
  // These boolean properties are not initialized in createLookaheadState()
  // instead they will only be set by the tokenizer
  containsEsc?: boolean
}
