import { ZeroPosition, type Position } from "../position.js"
import {
  tokenIsLiteralPropertyName,
  tt,
  type TokenType
} from "../token-types.js"
import { ScopeParser } from "./scope.js"
import type State from "../state.js"
import type { Node, ObjectProperty } from "../../ast/types.js"
import { lineBreak, skipWhiteSpaceToLineBreak } from "../utils.js"
import { isIdentifierChar } from "../identifier.js"
import { ClassScopeHandler } from "./scope.js"
import { ScopeFlag } from "./scope.js"
import {
  Errors,
  type ParseError,
  type ParseErrorConstructor
} from "../error.js"
import { type ScopeHandler } from "./scope.js"

type TryParse<Node, Error, Thrown, Aborted, FailState> = {
  node: Node
  error: Error
  thrown: Thrown
  aborted: Aborted
  failState: FailState
}

// ## Parser utilities

export default abstract class UtilParser extends ScopeParser {
  // Legacy: JS syntax toggle
  inModule: boolean = true
  classScope = new ClassScopeHandler(this)

  // Forward-declaration: defined in parser/index.js
  abstract getScopeHandler(): { new (...args: unknown[]): ScopeHandler }

  addExtra(
    node: Partial<Node> | undefined,
    key: string,
    value: unknown,
    enumerable: boolean = true
  ): void {
    if (!node) return

    const extra = (node.extra = node.extra ?? {})
    if (enumerable) {
      extra[key] = value
    } else {
      Object.defineProperty(extra, key, { enumerable, value })
    }
  }

  // Tests whether parsed token is a contextual keyword.

  isContextual(token: TokenType): boolean {
    return this.state.type === token && !this.state.containsEsc
  }

  isUnparsedContextual(nameStart: number, name: string): boolean {
    const nameEnd = nameStart + name.length
    if (this.input.slice(nameStart, nameEnd) === name) {
      const nextCh = this.input.charCodeAt(nameEnd)
      return !(
        isIdentifierChar(nextCh) ||
        // check if `nextCh is between 0xd800 - 0xdbff,
        // if `nextCh` is NaN, `NaN & 0xfc00` is 0, the function
        // returns true
        (nextCh & 0xfc00) === 0xd800
      )
    }
    return false
  }

  isLookaheadContextual(name: string): boolean {
    const next = this.nextTokenStart()
    return this.isUnparsedContextual(next, name)
  }

  // Consumes contextual keyword if possible.

  eatContextual(token: TokenType): boolean {
    if (this.isContextual(token)) {
      this.next()
      return true
    }
    return false
  }

  // Asserts that following token is given contextual keyword.

  expectContextual(
    token: TokenType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toParseError?: ParseErrorConstructor<any, any>
  ): void {
    if (!this.eatContextual(token)) {
      if (toParseError != null) {
        throw this.raise(toParseError, { at: this.state.startLoc })
      }
      this.unexpected(null, token)
    }
  }

  // Test whether a semicolon can be inserted at the current position.

  canInsertSemicolon(): boolean {
    return (
      this.match(tt.eof) ||
      this.match(tt.braceR) ||
      this.hasPrecedingLineBreak()
    )
  }

  hasPrecedingLineBreak(): boolean {
    if (this.state.lastTokEndLoc === undefined) return false
    return lineBreak.test(
      this.input.slice(this.state.lastTokEndLoc.index, this.state.start)
    )
  }

  hasFollowingLineBreak(): boolean {
    skipWhiteSpaceToLineBreak.lastIndex = this.state.end
    return skipWhiteSpaceToLineBreak.test(this.input)
  }

  isLineTerminator(): boolean {
    return this.eat(tt.semi) || this.canInsertSemicolon()
  }

  // Consume a semicolon, or, failing that, see if we are allowed to
  // pretend that there is a semicolon at this position.

  semicolon(allowAsi: boolean = true): void {
    if (allowAsi ? this.isLineTerminator() : this.eat(tt.semi)) return
    this.raise(Errors.MissingSemicolon, {
      at: this.state.lastTokEndLoc ?? ZeroPosition
    })
  }

  // Expect a token of a given type. If found, consume it, otherwise,
  // raise an unexpected token error at given pos.

  expect(type: TokenType, loc?: Position | null): void {
    this.eat(type) || this.unexpected(loc, type)
  }

  // tryParse will clone parser state.
  // It is expensive and should be used with cautions
  tryParse<T extends Node | readonly Node[]>(
    fn: (abort: (node?: T) => never) => T,
    oldState: State = this.state.clone()
  ):
    | TryParse<T, null, false, false, null>
    | TryParse<T | undefined, ParseError<unknown>, boolean, false, State>
    | TryParse<T | undefined, null, false, true, State> {
    const abortSignal: {
      node: T | undefined
    } = { node: undefined }
    try {
      const node = fn((node = undefined) => {
        abortSignal.node = node
        throw abortSignal
      })
      if (this.state.errors.length > oldState.errors.length) {
        const failState = this.state
        this.state = oldState
        // tokensLength should be preserved during error recovery mode
        // since the parser does not halt and will instead parse the
        // remaining tokens
        this.state.tokensLength = failState.tokensLength
        return {
          node,
          error: failState.errors[oldState.errors.length],
          thrown: false,
          aborted: false,
          failState
        }
      }

      return {
        node,
        error: null,
        thrown: false,
        aborted: false,
        failState: null
      }
    } catch (error) {
      const failState = this.state
      this.state = oldState
      if (error instanceof SyntaxError) {
        // @ts-expect-error casting general syntax error to parse error
        return { node: null, error, thrown: true, aborted: false, failState }
      }
      if (error === abortSignal) {
        return {
          node: abortSignal.node,
          error: null,
          thrown: false,
          aborted: true,
          failState
        }
      }

      throw error
    }
  }

  checkExpressionErrors(
    refExpressionErrors: ExpressionErrors | undefined | null,
    andThrow: boolean
  ) {
    if (!refExpressionErrors) return false
    const { shorthandAssignLoc, optionalParametersLoc } = refExpressionErrors

    const hasErrors = !!shorthandAssignLoc || !!optionalParametersLoc

    if (!andThrow) {
      return hasErrors
    }

    if (shorthandAssignLoc != null) {
      this.raise(Errors.InvalidCoverInitializedName, {
        at: shorthandAssignLoc
      })
    }

    if (optionalParametersLoc != null) {
      this.unexpected(optionalParametersLoc)
    }

    // Technically unreachable, but silence typescript warning.
    return true
  }

  /**
   * Test if current token is a literal property name
   * https://tc39.es/ecma262/#prod-LiteralPropertyName
   * LiteralPropertyName:
   *   IdentifierName
   *   StringLiteral
   *   NumericLiteral
   *   BigIntLiteral
   */
  isLiteralPropertyName(): boolean {
    return tokenIsLiteralPropertyName(this.state.type)
  }

  isObjectProperty(node: Node): node is ObjectProperty {
    return node.type === "ObjectProperty"
  }

  isObjectMethod(_node: Node): boolean {
    // return node.type === "ObjectMethod"
    return false
  }

  initializeScopes(): () => void {
    // Initialize state
    const oldLabels = this.state.labels
    this.state.labels = []

    // initialize scopes
    const oldScope = this.scope
    const ScopeHandler = this.getScopeHandler()
    this.scope = new ScopeHandler(this)

    const oldClassScope = this.classScope
    this.classScope = new ClassScopeHandler(this)

    return () => {
      // Revert state
      this.state.labels = oldLabels

      // Revert scopes
      this.scope = oldScope
      this.classScope = oldClassScope
    }
  }

  enterInitialScopes() {
    this.scope.enter(ScopeFlag.PROGRAM)
  }
}

/**
 * The ExpressionErrors is a context struct used to track ambiguous patterns
 * When we are sure the parsed pattern is a RHS, which means it is not a pattern,
 * we will throw on this position on invalid assign syntax, otherwise it will be reset to -1
 *
 * Types of ExpressionErrors:
 *
 * - **shorthandAssignLoc**: track initializer `=` position
 * - **doubleProtoLoc**: track the duplicate `__proto__` key position
 * - **privateKey**: track private key `#p` position
 * - **optionalParametersLoc**: track the optional parameter (`?`).
 * It's only used by typescript and flow plugins
 */
export class ExpressionErrors {
  shorthandAssignLoc: Position | undefined | null = null
  optionalParametersLoc: Position | undefined | null = null
}
