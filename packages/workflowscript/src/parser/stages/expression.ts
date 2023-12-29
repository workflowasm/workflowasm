// A recursive descent parser operates by defining functions for all
// syntactic elements, and recursively calling those, each function
// advancing the input stream and returning an AST node. Precedence
// of constructs (for example, the fact that `!x[1]` means `!(x[1])`
// instead of `(!x)[1]` is handled by the fact that the parser
// function that parses unary prefix operators is called first, and
// in turn calls the function that parses `[]` subscripts — that
// way, it'll receive the node for `x[1]` already parsed, and wraps
// *that* in the unary operator node.
//
// Acorn uses an [operator precedence parser][opp] to handle binary
// operator precedence, because it is much more compact than using
// the technique outlined above, which uses different, nesting
// functions to specify precedence, for all of the ten binary
// precedence levels that JavaScript defines.
//
// [opp]: http://en.wikipedia.org/wiki/Operator-precedence_parser

import {
  tokenIsAssignment,
  tokenIsIdentifier,
  tokenIsKeywordOrIdentifier,
  tokenIsOperator,
  tokenIsPrefix,
  tokenIsRightAssociative,
  tokenIsTemplate,
  tokenKeywordOrIdentifierIsKeyword,
  tokenOperatorPrecedence,
  tt,
  type TokenType
} from "../token-types.js"
import * as N from "../../ast/types.js"
import { type Incomplete } from "../../ast/types.js"
import LValParser from "./lval.js"
import { isKeyword, isReservedWord, canBeReservedWord } from "../keyword.js"
import {
  type Position,
  createPositionWithColumnOffset,
  ZeroPosition
} from "../position.js"
import * as charCodes from "charcodes"
import { BindingFlag } from "./scope.js"
import { ExpressionErrors } from "./util.js"
import { Errors, type ParseError } from "../error.js"
import { cloneIdentifier } from "./node.js"

export interface ParseSubscriptState {
  optionalChainMember: boolean
  maybeAsyncArrow: boolean
  stop: boolean
}

type FnAfterLeftParse = (expr: N.Expression, pos: Position) => N.Expression

export default abstract class ExpressionParser extends LValParser {
  // Forward-declaration: defined in statement.js
  abstract parseBlock(
    createNewLexicalScope?: boolean,
    afterBlockParse?: () => void
  ): N.BlockStatement

  abstract parseAnnotations(allowExport?: boolean): N.Annotation[] | null
  abstract parseFunction<T extends N.Function>(
    node: Incomplete<T>,
    statement?: number
  ): T
  abstract parseFunctionParams(node: N.Function, isConstructor?: boolean): void
  abstract parseBlockOrModuleBlockBody(
    body: N.Statement[],
    topLevel: boolean,
    end: TokenType,
    afterBlockParse?: () => void
  ): void
  abstract parseProgram(program: N.Program, end: TokenType): N.Program

  // XXX: unneeded
  shouldExitDescending(
    _expr?: N.Expression,
    _potentialArrowAt?: number
  ): boolean {
    return false
  }

  // Convenience method to parse an Expression only
  getExpression(): N.Expression & N.ParserOutput {
    this.enterInitialScopes()
    this.nextToken()
    const expr = this.parseExpression()
    if (!this.match(tt.eof)) {
      this.unexpected()
    }
    // Unlike parseTopLevel, we need to drain remaining commentStacks
    // because the top level node is _not_ Program.
    this.finalizeRemainingComments()
    const parserOutput: N.ParserOutput = {
      comments: this.state.comments,
      errors: this.state.errors
    }
    if (this.options.tokens) {
      parserOutput.tokens = this.tokens
    }
    return Object.assign(expr, parserOutput)
  }

  // ### Expression parsing

  // These nest, from the most general expression type at the top to
  // 'atomic', nondivisible expression types at the bottom. Most of
  // the functions will simply let the function (s) below them parse,
  // and, *if* the syntactic construct they handle is present, wrap
  // the AST node that the inner parser gave them in another node.

  // Parse a full expression.
  // - `disallowIn`
  //   is used to forbid the `in` operator (in for loops initialization expressions)
  //   When `disallowIn` is true, the production parameter [In] is not present.

  // - `refExpressionErrors `
  //   provides reference for storing '=' operator inside shorthand
  //   property assignment in contexts where both object expression
  //   and object pattern might appear (so it's possible to raise
  //   delayed syntax error at correct position).

  parseExpression(
    disallowIn?: boolean,
    refExpressionErrors?: ExpressionErrors
  ): N.Expression {
    if (disallowIn ?? false) {
      return this.disallowInAnd(() =>
        this.parseExpressionBase(refExpressionErrors)
      )
    }
    return this.allowInAnd(() => this.parseExpressionBase(refExpressionErrors))
  }

  // https://tc39.es/ecma262/#prod-Expression
  parseExpressionBase(refExpressionErrors?: ExpressionErrors): N.Expression {
    const startLoc = this.state.startLoc
    const expr = this.parseMaybeAssign(refExpressionErrors)
    if (this.match(tt.comma)) {
      const node = this.startNodeAt<N.SequenceExpression>(startLoc)
      node.expressions = [expr]
      while (this.eat(tt.comma)) {
        node.expressions.push(this.parseMaybeAssign(refExpressionErrors))
      }
      this.toReferencedList(node.expressions)
      return this.finishNode(node, "SequenceExpression")
    }
    return expr
  }

  // Set [~In] parameter for assignment expression
  parseMaybeAssignDisallowIn(
    refExpressionErrors?: ExpressionErrors | null,
    afterLeftParse?: FnAfterLeftParse
  ) {
    return this.disallowInAnd(() =>
      this.parseMaybeAssign(refExpressionErrors, afterLeftParse)
    )
  }

  // Set [+In] parameter for assignment expression
  parseMaybeAssignAllowIn(
    refExpressionErrors?: ExpressionErrors | null,
    afterLeftParse?: FnAfterLeftParse
  ) {
    return this.allowInAnd(() =>
      this.parseMaybeAssign(refExpressionErrors, afterLeftParse)
    )
  }

  // This method is only used by
  // the typescript and flow plugins.
  setOptionalParametersError(
    refExpressionErrors: ExpressionErrors,
    resultError?: ParseError<unknown>
  ) {
    refExpressionErrors.optionalParametersLoc =
      resultError?.loc ?? this.state.startLoc
  }

  // Parse an assignment expression. This includes applications of
  // operators like `+=`.
  // https://tc39.es/ecma262/#prod-AssignmentExpression
  parseMaybeAssign(
    refExpressionErrors?: ExpressionErrors | null,
    afterLeftParse?: (expr: N.Expression, pos: Position) => N.Expression
  ): N.Expression {
    const startLoc = this.state.startLoc

    let ownExpressionErrors
    if (refExpressionErrors) {
      ownExpressionErrors = false
    } else {
      refExpressionErrors = new ExpressionErrors()
      ownExpressionErrors = true
    }

    let left = this.parseMaybeConditional(refExpressionErrors)
    if (afterLeftParse) {
      left = afterLeftParse.call(this, left, startLoc)
    }
    if (tokenIsAssignment(this.state.type)) {
      const node = this.startNodeAt<N.AssignmentExpression>(startLoc)

      // TODO: disable other forms of assignment
      if (this.match(tt.eq)) {
        this.toAssignable(left, /* isLHS */ true)
        node.left = left

        const startIndex = startLoc.index
        if (
          refExpressionErrors.shorthandAssignLoc != null &&
          refExpressionErrors.shorthandAssignLoc.index >= startIndex
        ) {
          refExpressionErrors.shorthandAssignLoc = null // reset because shorthand default was used correctly
        }
      } else {
        node.left = left
      }

      this.next()
      node.right = this.parseMaybeAssign()
      const finishedNode = this.finishNode(node, "AssignmentExpression")
      this.checkLVal(left, {
        in: finishedNode
      })

      return finishedNode
    } else if (ownExpressionErrors) {
      this.checkExpressionErrors(refExpressionErrors, true)
    }

    return left
  }

  // Parse a ternary conditional (`?:`) operator.
  // https://tc39.es/ecma262/#prod-ConditionalExpression

  parseMaybeConditional(refExpressionErrors: ExpressionErrors): N.Expression {
    const startLoc = this.state.startLoc
    const expr = this.parseExprOps(refExpressionErrors)

    if (this.shouldExitDescending(expr)) {
      return expr
    }

    return this.parseConditional(expr, startLoc, refExpressionErrors)
  }

  parseConditional(
    expr: N.Expression,
    startLoc: Position,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    refExpressionErrors?: ExpressionErrors | null
  ): N.Expression {
    if (this.eat(tt.question)) {
      const node = this.startNodeAt<N.ConditionalExpression>(startLoc)
      node.test = expr
      node.consequent = this.parseMaybeAssignAllowIn()
      this.expect(tt.colon)
      node.alternate = this.parseMaybeAssign()
      return this.finishNode(node, "ConditionalExpression")
    }
    return expr
  }

  parseMaybeUnaryOrPrivate(
    refExpressionErrors?: ExpressionErrors
  ): N.Expression {
    return this.parseMaybeUnary(refExpressionErrors)
  }

  // Start the precedence parser.
  // https://tc39.es/ecma262/#prod-ShortCircuitExpression

  parseExprOps(refExpressionErrors: ExpressionErrors): N.Expression {
    const startLoc = this.state.startLoc
    const expr = this.parseMaybeUnaryOrPrivate(refExpressionErrors)

    // XXX: unneeded
    if (this.shouldExitDescending(expr)) {
      return expr
    }

    return this.parseExprOp(expr, startLoc, -1)
  }

  // Parse binary operators with the operator precedence parsing
  // algorithm. `left` is the left-hand side of the operator.
  // `minPrec` provides context that allows the function to stop and
  // defer further parser to one of its callers when it encounters an
  // operator that has a lower precedence than the set it is parsing.

  parseExprOp(
    left: N.Expression,
    leftStartLoc: Position,
    minPrec: number
  ): N.Expression {
    const op = this.state.type
    if (tokenIsOperator(op)) {
      let prec = tokenOperatorPrecedence(op)
      if (prec > minPrec) {
        const node = this.startNodeAt<N.BinaryExpression>(leftStartLoc)
        node.left = left
        node.operator = this.state.value as N.BinaryOperator

        const logical = op === tt.logicalOR || op === tt.logicalAND
        const coalesce = op === tt.nullishCoalescing

        if (coalesce) {
          // Handle the precedence of `tt.coalesce` as equal to the range of logical expressions.
          // In other words, `node.right` shouldn't contain logical expressions in order to check the mixed error.
          prec = tokenOperatorPrecedence(tt.logicalAND)
        }

        this.next()

        node.right = this.parseExprOpRightExpr(op, prec)
        const finishedNode = this.finishNode(node, "BinaryExpression")
        /* this check is for all ?? operators
         * a ?? b && c for this example
         * when op is coalesce and nextOp is logical (&&), throw at the pos of nextOp that it can not be mixed.
         * Symmetrically it also throws when op is logical and nextOp is coalesce
         */
        const nextOp = this.state.type
        if (
          (coalesce && (nextOp === tt.logicalOR || nextOp === tt.logicalAND)) ||
          (logical && nextOp === tt.nullishCoalescing)
        ) {
          throw this.raise(Errors.MixingCoalesceWithLogical, {
            at: this.state.startLoc
          })
        }

        return this.parseExprOp(finishedNode, leftStartLoc, minPrec)
      }
    }
    return left
  }

  // Helper function for `parseExprOp`. Parse the right-hand side of binary-
  // operator expressions, then apply any operator-specific functions.

  parseExprOpRightExpr(op: TokenType, prec: number): N.Expression {
    // XXX: fix
    //const startLoc = this.state.startLoc
    switch (op) {
      // Falls through.
      default:
        return this.parseExprOpBaseRightExpr(op, prec)
    }
  }

  // Helper function for `parseExprOpRightExpr`. Parse the right-hand side of
  // binary-operator expressions without applying any operator-specific functions.
  parseExprOpBaseRightExpr(op: TokenType, prec: number): N.Expression {
    const startLoc = this.state.startLoc

    return this.parseExprOp(
      this.parseMaybeUnaryOrPrivate(),
      startLoc,
      tokenIsRightAssociative(op) ? prec - 1 : prec
    )
  }

  checkExponentialAfterUnary(node: Incomplete<N.UnaryExpression>) {
    if (this.match(tt.exponent)) {
      this.raise(Errors.UnexpectedTokenUnaryExponentiation, {
        at: node.argument
      })
    }
  }

  // Parse unary operators, both prefix and postfix.
  // https://tc39.es/ecma262/#prod-UnaryExpression
  parseMaybeUnary(
    refExpressionErrors?: ExpressionErrors | null,
    sawUnary?: boolean
  ): N.Expression {
    //const startLoc = this.state.startLoc

    const node = this.startNode<N.UnaryExpression>()
    if (tokenIsPrefix(this.state.type)) {
      node.operator = this.state.value as N.UnaryOperator
      node.prefix = true

      // XXX: don't allow throw expression
      if (this.match(tt._throw)) {
        this.raise(Errors.UnexpectedToken, { at: node })
      }
      // XXX: don't allow js operator delete
      if (this.match(tt._delete)) {
        this.raise(Errors.UnexpectedToken, { at: node })
      }
      this.next()

      node.argument = this.parseMaybeUnary(null, true)

      this.checkExpressionErrors(refExpressionErrors, true)

      if (!(sawUnary ?? false)) {
        this.checkExponentialAfterUnary(node)
      }
      return this.finishNode(node, "UnaryExpression")
    }

    const expr = this.parseUpdate(
      // @ts-expect-error using "Undone" node as "done"
      node,
      false,
      refExpressionErrors
    )

    return expr
  }

  // https://tc39.es/ecma262/#prod-UpdateExpression
  parseUpdate(
    node: N.Expression,
    update: boolean,
    refExpressionErrors?: ExpressionErrors | null
  ): N.Expression {
    // XXX: update is always false because we don't allow update operators

    // if (update) {
    //   // @ts-expect-error Type 'Node' is missing the following properties from type 'Undone<UpdateExpression>': prefix, operator, argument
    //   const updateExpressionNode = node as Undone<N.UpdateExpression>
    //   this.checkLVal(updateExpressionNode.argument, {
    //     in: this.finishNode(updateExpressionNode, "UpdateExpression")
    //   })
    //   return node
    // }

    //const startLoc = this.state.startLoc
    const expr = this.parseExprSubscripts(refExpressionErrors)
    if (this.checkExpressionErrors(refExpressionErrors, false)) return expr

    // XXX: this only pulls off trailing updates, which cant exist here
    // while (tokenIsPostfix(this.state.type) && !this.canInsertSemicolon()) {
    //   const node = this.startNodeAt<N.UpdateExpression>(startLoc)
    //   node.operator = this.state.value
    //   node.prefix = false
    //   node.argument = expr
    //   this.next()
    //   this.checkLVal(expr, {
    //     in: (expr = this.finishNode(node, "UpdateExpression"))
    //   })
    // }
    return expr
  }

  // Parse call, dot, and `[]`-subscript expressions.
  // https://tc39.es/ecma262/#prod-LeftHandSideExpression
  parseExprSubscripts(
    refExpressionErrors?: ExpressionErrors | null
  ): N.Expression {
    const startLoc = this.state.startLoc
    const expr = this.parseExprAtom(refExpressionErrors)

    // XXX: unneeded
    if (this.shouldExitDescending(expr)) {
      return expr
    }

    return this.parseSubscripts(expr, startLoc)
  }

  parseSubscripts(
    base: N.Expression,
    startLoc: Position,
    noCalls?: boolean | null
  ): N.Expression {
    const state: ParseSubscriptState = {
      optionalChainMember: false,
      maybeAsyncArrow: false,
      stop: false
    }
    do {
      base = this.parseSubscript(base, startLoc, noCalls, state)

      // After parsing a subscript, this isn't "async" for sure.
      state.maybeAsyncArrow = false
    } while (!state.stop)
    return base
  }

  /**
   * @param state Set 'state.stop = true' to indicate that we should stop parsing subscripts.
   *   state.optionalChainMember to indicate that the member is currently in OptionalChain
   */
  parseSubscript(
    base: N.Expression,
    startLoc: Position,
    noCalls: boolean | undefined | null,
    state: ParseSubscriptState
  ): N.Expression {
    const { type } = this.state
    if (tokenIsTemplate(type)) {
      return this.parseTaggedTemplateExpression(base, startLoc, state)
    }

    let optional = false

    if (type === tt.questionDot) {
      if (noCalls ?? false) {
        // XXX: "optional chaining no new?"
        this.raise(Errors.UnexpectedToken, {
          at: this.state.startLoc
        })
        if (this.lookaheadCharCode() === charCodes.leftParenthesis) {
          // stop at `?.` when parsing `new a?.()`
          state.stop = true
          return base
        }
      }
      state.optionalChainMember = optional = true
      this.next()
    }

    if (!(noCalls ?? false) && this.match(tt.parenL)) {
      return this.parseCoverCallAndAsyncArrowHead(
        base,
        startLoc,
        state,
        optional
      )
    } else {
      const computed = this.eat(tt.bracketL)
      if (computed || optional || this.eat(tt.dot)) {
        return this.parseMember(base, startLoc, state, computed, optional)
      } else {
        state.stop = true
        return base
      }
    }
  }

  // base[?Yield, ?Await] [ Expression[+In, ?Yield, ?Await] ]
  // base[?Yield, ?Await] . IdentifierName
  // base[?Yield, ?Await] . PrivateIdentifier
  //   where `base` is one of CallExpression, MemberExpression and OptionalChain
  parseMember(
    base: N.Expression,
    startLoc: Position,
    state: ParseSubscriptState,
    computed: boolean,
    optional: boolean
  ): N.MemberExpression {
    const node = this.startNodeAt<N.MemberExpression>(startLoc)
    node.object = base
    node.computed = computed
    if (computed) {
      node.property = this.parseExpression()
      this.expect(tt.bracketR)
    } else {
      node.property = this.parseIdentifier(true)
    }

    if (state.optionalChainMember) {
      node.optional = optional
      return this.finishNode(node, "MemberExpression")
    } else {
      return this.finishNode(node, "MemberExpression")
    }
  }

  // https://tc39.es/ecma262/#prod-CoverCallExpressionAndAsyncArrowHead
  // CoverCallExpressionAndAsyncArrowHead
  // CallExpression[?Yield, ?Await] Arguments[?Yield, ?Await]
  // OptionalChain[?Yield, ?Await] Arguments[?Yield, ?Await]
  parseCoverCallAndAsyncArrowHead(
    base: N.Expression,
    startLoc: Position,
    state: ParseSubscriptState,
    optional: boolean
  ): N.Expression {
    const refExpressionErrors: ExpressionErrors | null = null

    this.next() // eat `(`

    const node = this.startNodeAt<N.CallExpression>(startLoc)
    node.callee = base
    const { optionalChainMember } = state

    if (optionalChainMember) {
      node.optional = optional
    }

    if (optional) {
      node.arguments = this.parseCallExpressionArguments(tt.parenR)
    } else {
      node.arguments = this.parseCallExpressionArguments(
        tt.parenR,
        node,
        refExpressionErrors
      )
    }
    const finishedNode: N.CallExpression = this.finishCallExpression(
      node,
      optionalChainMember
    )

    this.toReferencedArguments(finishedNode)

    return finishedNode
  }

  toReferencedArguments(node: N.CallExpression, isParenthesizedExpr?: boolean) {
    this.toReferencedListDeep(node.arguments, isParenthesizedExpr)
  }

  // MemberExpression [?Yield, ?Await] TemplateLiteral[?Yield, ?Await, +Tagged]
  // CallExpression [?Yield, ?Await] TemplateLiteral[?Yield, ?Await, +Tagged]
  parseTaggedTemplateExpression(
    base: N.Expression,
    startLoc: Position,
    state: ParseSubscriptState
  ): N.TaggedTemplateExpression {
    const node = this.startNodeAt<N.TaggedTemplateExpression>(startLoc)
    node.tag = base
    node.quasi = this.parseTemplate(true)
    if (state.optionalChainMember) {
      this.raise(Errors.OptionalChainingNoTemplate, { at: startLoc })
    }
    return this.finishNode(node, "TaggedTemplateExpression")
  }

  // XXX: fix
  atPossibleAsyncArrow(_base: N.Expression): boolean {
    return false
  }

  finishCallExpression(
    node: Incomplete<N.CallExpression>,
    _optional: boolean
  ): N.CallExpression {
    // XXX: why is optional unused?
    return this.finishNode(node, "CallExpression")
  }

  parseCallExpressionArguments(
    close: TokenType,
    nodeForExtra?: Incomplete<N.Node> | null,
    refExpressionErrors?: ExpressionErrors | null
  ): N.Expression[] {
    const elts: N.Expression[] = []
    let first = true

    while (!this.eat(close)) {
      if (first) {
        first = false
      } else {
        this.expect(tt.comma)
        if (this.match(close)) {
          if (nodeForExtra) {
            this.addTrailingCommaExtraToNode(nodeForExtra)
          }
          this.next()
          break
        }
      }

      elts.push(this.parseExprListItem(refExpressionErrors))
    }

    return elts
  }

  // Parse a no-call expression (like argument of `new` or `::` operators).
  // https://tc39.es/ecma262/#prod-MemberExpression
  parseNoCallExpr(): N.Expression {
    const startLoc = this.state.startLoc
    return this.parseSubscripts(this.parseExprAtom(), startLoc, true)
  }

  // Parse an atomic expression — either a single token that is an
  // expression, an expression started by a keyword like `function` or
  // `new`, or an expression wrapped in punctuation like `()`, `[]`,
  // or `{}`.

  // https://tc39.es/ecma262/#prod-PrimaryExpression
  // https://tc39.es/ecma262/#prod-AsyncArrowFunction
  // PrimaryExpression
  // Super
  // Import
  // AsyncArrowFunction

  parseExprAtom(refExpressionErrors?: ExpressionErrors | null): N.Expression {
    //let annotations: N.Annotation[] | null = null

    const { type } = this.state
    switch (type) {
      case tt.float:
        return this.parseFloatLiteral(this.state.value as number)

      case tt.int:
        return this.parseIntLiteral(this.state.value as bigint)

      case tt.string:
        return this.parseStringLiteral(this.state.value as string)

      case tt._null:
        return this.parseNullLiteral()

      case tt._true:
        return this.parseBooleanLiteral(true)
      case tt._false:
        return this.parseBooleanLiteral(false)

      case tt.parenL: {
        return this.parseParenAndDistinguishExpression()
      }

      case tt.bracketL: {
        return this.parseArrayLike(
          tt.bracketR,
          /* canBePattern */ true,
          refExpressionErrors
        )
      }

      case tt.braceL: {
        return this.parseObjectLike(
          tt.braceR,
          /* isPattern */ false,
          refExpressionErrors
        )
      }

      case tt._fn:
        return this.parseFunctionOrFunctionSent()

      case tt.at:
        // XXX: determine whether to allow annotations here
        this.unexpected()
        break
      //annotations = this.parseAnnotations()
      // deliberate fallthrough if annotations

      case tt.templateNonTail:
      case tt.templateTail:
        return this.parseTemplate(false)

      case tt.modulo:
      case tt.hash: {
        this.unexpected()
        break
      }

      case tt.lt: {
        this.unexpected()
        break
      }

      default:
        if (tokenIsIdentifier(type)) {
          // XXX: why care if contains esc
          //const containsEsc = this.state.containsEsc
          const id = this.parseIdentifier()

          return id
        } else {
          this.unexpected()
        }
    }

    // XXX: if we get here there was a parse error with nothrow enabled, but
    // caller is expecting an expression. Return a null literal to allow the
    // parser to proceed.
    const node = this.startNodeAt<N.NullLiteral>(this.state.startLoc)
    return this.finishNode(node, "NullLiteral")
  }

  /**
   * Parse an expression of the form `(identifier).(identifier)...`
   * with no optional chaining or computed properties allowed.
   */
  parseDotPath(): N.DotPath {
    const identifiers: N.Identifier[] = []
    const dp = this.startNode<N.DotPath>()
    identifiers.push(this.parseIdentifier())
    while (this.match(tt.dot)) {
      this.next()
      identifiers.push(this.parseIdentifier())
    }
    dp.identifiers = identifiers
    return this.finishNode(dp, "DotPath")
  }

  parseFunctionOrFunctionSent(): N.FunctionExpression {
    const node = this.startNode<N.FunctionExpression>()

    this.next() // eat `function`

    return this.parseFunction(node)
  }

  parseLiteralAtNode<T extends N.PrimitiveValueLiteral>(
    value: T["value"],
    type: T["type"],
    node: Incomplete<T>
  ): T {
    this.addExtra(node, "rawValue", value)
    this.addExtra(node, "raw", this.input.slice(node.start, this.state.end))
    node.value = value
    this.next()
    return this.finishNode<T>(node, type)
  }

  parseLiteral<T extends N.PrimitiveValueLiteral>(
    value: T["value"],
    type: T["type"]
  ): T {
    const node = this.startNode<T>()
    return this.parseLiteralAtNode(value, type, node)
  }

  parseStringLiteral(value: string) {
    return this.parseLiteral<N.StringLiteral>(value, "StringLiteral")
  }

  parseFloatLiteral(value: number) {
    return this.parseLiteral<N.FloatLiteral>(value, "FloatLiteral")
  }

  parseIntLiteral(value: bigint) {
    return this.parseLiteral<N.IntLiteral>(value, "IntLiteral")
  }

  parseBooleanLiteral(value: boolean) {
    const node = this.startNode<N.BooleanLiteral>()
    node.value = value
    this.next()
    return this.finishNode(node, "BooleanLiteral")
  }

  parseNullLiteral() {
    const node = this.startNode<N.NullLiteral>()
    this.next()
    return this.finishNode(node, "NullLiteral")
  }

  // https://tc39.es/ecma262/#prod-CoverParenthesizedExpressionAndArrowParameterList
  parseParenAndDistinguishExpression(): N.Expression {
    const startLoc = this.state.startLoc

    this.next() // eat `(`

    const innerStartLoc = this.state.startLoc
    const exprList: N.Expression[] = []
    const refExpressionErrors = new ExpressionErrors()
    let first = true
    let spreadStartLoc
    let optionalCommaStartLoc

    while (!this.match(tt.parenR)) {
      if (first) {
        first = false
      } else {
        this.expect(
          tt.comma,
          refExpressionErrors.optionalParametersLoc === null
            ? null
            : refExpressionErrors.optionalParametersLoc
        )
        if (this.match(tt.parenR)) {
          optionalCommaStartLoc = this.state.startLoc
          break
        }
      }

      if (this.match(tt.ellipsis)) {
        const spreadNodeStartLoc = this.state.startLoc
        spreadStartLoc = this.state.startLoc
        exprList.push(
          this.parseParenItem(this.parseRestBinding(), spreadNodeStartLoc)
        )

        if (!this.checkCommaAfterRest(charCodes.rightParenthesis)) {
          break
        }
      } else {
        exprList.push(
          // eslint-disable-next-line @typescript-eslint/unbound-method
          this.parseMaybeAssignAllowIn(refExpressionErrors, this.parseParenItem)
        )
      }
    }

    const innerEndLoc = this.state.lastTokEndLoc
    this.expect(tt.parenR)

    if (!exprList.length) {
      this.unexpected(this.state.lastTokStartLoc)
    }
    if (optionalCommaStartLoc) this.unexpected(optionalCommaStartLoc)
    if (spreadStartLoc) this.unexpected(spreadStartLoc)
    this.checkExpressionErrors(refExpressionErrors, true)

    this.toReferencedListDeep(exprList, /* isParenthesizedExpr */ true)
    let val: N.Expression
    if (exprList.length > 1) {
      val = this.startNodeAt<N.SequenceExpression>(
        innerStartLoc
      ) as N.SequenceExpression
      val.expressions = exprList
      // finish node at current location so it can pick up comments after `)`
      this.finishNode(val, "SequenceExpression")
      this.resetEndLocation(val, innerEndLoc)
    } else {
      val = exprList[0]
    }

    return this.wrapParenthesis(startLoc, val)
  }

  wrapParenthesis(startLoc: Position, expression: N.Expression): N.Expression {
    if (!this.options.createParenthesizedExpressions) {
      this.addExtra(expression, "parenthesized", true)
      this.addExtra(expression, "parenStart", startLoc.index)

      this.takeSurroundingComments(
        expression,
        startLoc.index,
        this.state.lastTokEndLoc?.index ?? ZeroPosition.index
      )

      return expression
    }

    const parenExpression =
      this.startNodeAt<N.ParenthesizedExpression>(startLoc)
    parenExpression.expression = expression
    return this.finishNode(parenExpression, "ParenthesizedExpression")
  }

  parseParenItem(
    node: N.Expression,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startLoc: Position
  ): N.Expression {
    return node
  }

  // Parse template expression.
  parseTemplateElement(isTagged: boolean): N.TemplateElement {
    const { start, startLoc, end, value } = this.state
    const elemStart = start + 1
    const elem = this.startNodeAt<N.TemplateElement>(
      createPositionWithColumnOffset(startLoc, 1)
    )
    if (value == null) {
      if (!isTagged) {
        this.raise(Errors.InvalidEscapeSequenceTemplate, {
          // XXX: Adding 1 is probably wrong.
          at: createPositionWithColumnOffset(
            this.state.firstInvalidTemplateEscapePos ?? ZeroPosition,
            1
          )
        })
      }
    }

    const isTail = this.match(tt.templateTail)
    const endOffset = isTail ? -1 : -2
    const elemEnd = end + endOffset
    elem.value = {
      raw: this.input.slice(elemStart, elemEnd).replace(/\r\n?/g, "\n"),
      cooked: value == null ? "" : (value as string).slice(1, endOffset)
    }
    elem.tail = isTail
    this.next()
    const finishedNode = this.finishNode(elem, "TemplateElement")
    this.resetEndLocation(
      finishedNode,
      createPositionWithColumnOffset(
        this.state.lastTokEndLoc ?? ZeroPosition,
        endOffset
      )
    )
    return finishedNode
  }

  // https://tc39.es/ecma262/#prod-TemplateLiteral
  parseTemplate(isTagged: boolean): N.TemplateLiteral {
    const node = this.startNode<N.TemplateLiteral>()
    node.expressions = []
    let curElt = this.parseTemplateElement(isTagged)
    node.quasis = [curElt]
    while (!curElt.tail) {
      node.expressions.push(this.parseTemplateSubstitution())
      this.readTemplateContinuation()
      node.quasis.push((curElt = this.parseTemplateElement(isTagged)))
    }
    return this.finishNode(node, "TemplateLiteral")
  }

  // This is overwritten by the TypeScript plugin to parse template types
  parseTemplateSubstitution(): N.Expression {
    return this.parseExpression()
  }

  // Parse an object literal, binding pattern, or record.
  parseObjectLike(
    close: TokenType,
    isPattern: true,
    refExpressionErrors?: ExpressionErrors | null
  ): N.ObjectPattern
  parseObjectLike(
    close: TokenType,
    isPattern: false,
    refExpressionErrors?: ExpressionErrors | null
  ): N.ObjectExpression
  parseObjectLike<T extends N.ObjectPattern | N.ObjectExpression>(
    close: TokenType,
    isPattern: boolean,
    refExpressionErrors?: ExpressionErrors | null
  ): T {
    let first = true
    const node = this.startNode<N.ObjectExpression | N.ObjectPattern>()

    node.properties = []
    this.next()

    while (!this.match(close)) {
      if (first) {
        first = false
      } else {
        this.expect(tt.comma)
        if (this.match(close)) {
          this.addTrailingCommaExtraToNode(node)
          break
        }
      }

      let prop
      if (isPattern) {
        prop = this.parseBindingProperty()
      } else {
        prop = this.parsePropertyDefinition(refExpressionErrors)
      }

      if ("shorthand" in prop && prop.shorthand) {
        this.addExtra(prop, "shorthand", true)
      }

      // @ts-expect-error This is type-safe because of the `isPattern`
      // check above
      node.properties.push(prop)
    }

    this.next()

    let type: "ObjectExpression" | "ObjectPattern" = "ObjectExpression"
    if (isPattern) {
      type = "ObjectPattern"
    }

    // XXX: check
    // @ts-expect-error Possible type-unsafe here, but can't diagnose properly
    return this.finishNode(node, type)
  }

  addTrailingCommaExtraToNode(node: Incomplete<N.Node>): void {
    this.addExtra(node, "trailingComma", this.state.lastTokStart)
    this.addExtra(node, "trailingCommaLoc", this.state.lastTokStartLoc, false)
  }

  // https://tc39.es/ecma262/#prod-PropertyDefinition
  parsePropertyDefinition(
    refExpressionErrors?: ExpressionErrors | null
  ): N.ObjectProperty | N.SpreadElement {
    let annotations: N.Annotation[] = []
    if (this.match(tt.at)) {
      // we needn't check if decorators (stage 0) plugin is enabled since it's checked by
      // the call to this.parseDecorator
      while (this.match(tt.at)) {
        annotations.push(this.parseAnnotation())
      }
    }

    const prop = this.startNode<N.ObjectProperty>()
    let startLoc

    if (this.match(tt.ellipsis)) {
      if (annotations.length) this.unexpected()
      return this.parseSpread()
    }

    if (annotations.length) {
      prop.annotations = annotations
      annotations = []
    }

    if (refExpressionErrors) {
      startLoc = this.state.startLoc
    }

    prop.key = this.parsePropertyName(prop, refExpressionErrors)

    return this.parseObjPropValue(
      prop,
      startLoc,
      false /* isPattern */,
      refExpressionErrors
    )
  }

  // if `isPattern` is true, parse https://tc39.es/ecma262/#prod-BindingProperty
  // else https://tc39.es/ecma262/#prod-PropertyDefinition
  parseObjectProperty(
    prop: Incomplete<N.ObjectProperty>,
    startLoc: Position | undefined | null,
    isPattern: boolean,
    refExpressionErrors?: ExpressionErrors | null
  ): N.ObjectProperty | undefined | null {
    prop.shorthand = false

    if (this.eat(tt.colon)) {
      prop.value = isPattern
        ? this.parseMaybeDefault(this.state.startLoc)
        : this.parseMaybeAssignAllowIn(refExpressionErrors)

      return this.finishNode(prop, "ObjectProperty")
    }

    if (!prop.computed && prop.key.type === "Identifier") {
      // PropertyDefinition:
      //   IdentifierReference
      //   CoverInitializedName
      // Note: `{ eval } = {}` will be checked in `checkLVal` later.
      this.checkReservedWord(prop.key.name, prop.key.loc.start, true)

      if (isPattern) {
        prop.value = this.parseMaybeDefault(startLoc, cloneIdentifier(prop.key))
      } else if (this.match(tt.eq)) {
        const shorthandAssignLoc = this.state.startLoc
        if (refExpressionErrors != null) {
          if (refExpressionErrors.shorthandAssignLoc === null) {
            refExpressionErrors.shorthandAssignLoc = shorthandAssignLoc
          }
        } else {
          this.raise(Errors.InvalidCoverInitializedName, {
            at: shorthandAssignLoc
          })
        }
        prop.value = this.parseMaybeDefault(startLoc, cloneIdentifier(prop.key))
      } else {
        prop.value = cloneIdentifier(prop.key)
      }
      prop.shorthand = true

      return this.finishNode(prop, "ObjectProperty")
    }

    return undefined
  }

  parseObjPropValue(
    prop: Incomplete<N.ObjectProperty>,
    startLoc: Position | undefined | null,
    isPattern: boolean,
    refExpressionErrors?: ExpressionErrors | null
  ): N.ObjectProperty {
    const node = this.parseObjectProperty(
      prop,
      startLoc,
      isPattern,
      refExpressionErrors
    )

    if (node == null) this.unexpected()

    return node as N.ObjectProperty
  }

  // https://tc39.es/ecma262/#prod-PropertyName
  // when refExpressionErrors presents, it will parse private name
  // and record the position of the first private name
  parsePropertyName(
    prop: Incomplete<N.ObjectProperty>,
    // XXX: do we need refExpressionErrors at all?
    _refExpressionErrors?: ExpressionErrors | null
  ): N.Expression | N.Identifier {
    if (this.eat(tt.bracketL)) {
      prop.computed = true
      prop.key = this.parseMaybeAssignAllowIn()
      this.expect(tt.bracketR)
    } else {
      // We check if it's valid for it to be a private name when we push it.
      const { type, value } = this.state
      let key
      // most un-computed property names are identifiers
      if (tokenIsKeywordOrIdentifier(type)) {
        key = this.parseIdentifier(true)
      } else {
        switch (type) {
          case tt.float:
            key = this.parseFloatLiteral(value as number)
            break
          case tt.string:
            key = this.parseStringLiteral(value as string)
            break
          case tt.int:
            key = this.parseIntLiteral(value as bigint)
            break
          default:
            this.unexpected()
        }
      }
      prop.key = key as N.Expression
      prop.computed = false
    }

    return prop.key
  }

  // Initialize empty function node.
  initFunction(node: Incomplete<N.Function>): void {
    node.name = undefined
  }

  // parse an array literal or tuple literal
  // https://tc39.es/ecma262/#prod-ArrayLiteral
  // https://tc39.es/proposal-record-tuple/#prod-TupleLiteral
  parseArrayLike(
    close: TokenType,
    canBePattern: boolean,
    refExpressionErrors?: ExpressionErrors | null
  ): N.ArrayExpression {
    const node = this.startNode<N.ArrayExpression>()
    this.next()
    node.elements = this.parseExprList(close, refExpressionErrors, node)
    return this.finishNode(node, "ArrayExpression")
  }

  parseFunctionBodyAndFinish<T extends N.Function>(
    node: Incomplete<T>,
    type: T["type"]
  ): T {
    this.parseFunctionBody(node)
    return this.finishNode(node, type)
  }

  // Parse function body and check parameters.
  parseFunctionBody(node: Incomplete<N.Function>): void {
    // Start a new scope with regard to labels
    // flag (restore them to their old value afterwards).
    const oldLabels = this.state.labels
    this.state.labels = []

    node.body = this.parseBlock(
      true,
      // Strict mode function checks after we parse the statements in the function body.
      () => {
        // Add the params to varDeclaredNames to ensure that an error is thrown
        // if a let/const declaration in the function clashes with one of the params.
        this.checkParams(node)

        // Ensure the function name isn't a forbidden identifier in strict mode, e.g. 'eval'
        if (node.name) {
          this.checkIdentifier(node.name, BindingFlag.TYPE_OUTSIDE)
        }
      }
    )
    this.state.labels = oldLabels
  }

  isSimpleParameter(node: N.Pattern) {
    return node.type === "Identifier"
  }

  isSimpleParamList(params: ReadonlyArray<N.Pattern>): boolean {
    for (let i = 0, len = params.length; i < len; i++) {
      if (!this.isSimpleParameter(params[i])) return false
    }
    return true
  }

  checkParams(node: Incomplete<N.Function>): void {
    const checkClashes = new Set<string>()
    // We create a fake node with the "ephemeral" type `FormalParameters`[1]
    // since we just store an array of parameters. Perhaps someday we can have
    // something like class FormalParameters extends Array { ... }, which would
    // also be helpful when traversing this node.
    //
    // 1. https://tc39.es/ecma262/#prod-FormalParameters
    const formalParameters = { type: "FormalParameters" } as const
    for (const param of node.parameters) {
      this.checkLVal(param, {
        in: formalParameters,
        binding: BindingFlag.TYPE_VAR,
        checkClashes
      })
    }
  }

  // Parses a comma-separated list of expressions, and returns them as
  // an array. `close` is the token type that ends the list, and
  // `allowEmpty` can be turned on to allow subsequent commas with
  // nothing in between them to be parsed as `null` (which is needed
  // for array literals).

  parseExprList(
    close: TokenType,
    refExpressionErrors?: ExpressionErrors | null,
    nodeForExtra?: Incomplete<N.Node> | null
  ): N.Expression[] {
    const elts: N.Expression[] = []
    let first = true

    while (!this.eat(close)) {
      if (first) {
        first = false
      } else {
        this.expect(tt.comma)
        if (this.match(close)) {
          if (nodeForExtra) {
            this.addTrailingCommaExtraToNode(nodeForExtra)
          }
          this.next()
          break
        }
      }

      elts.push(this.parseExprListItem(refExpressionErrors))
    }
    return elts
  }

  parseExprListItem(
    refExpressionErrors?: ExpressionErrors | null
  ): N.Expression {
    let elt
    if (this.match(tt.comma)) {
      this.raise(Errors.UnexpectedToken, {
        at: this.state.curPosition(),
        unexpected: ","
      })
      // XXX: parse error here, but create a null literal to
      // allow parse to proceed
      elt = this.finishNode(this.startNode<N.NullLiteral>(), "NullLiteral")
    } else if (this.match(tt.ellipsis)) {
      const spreadNodeStartLoc = this.state.startLoc

      elt = this.parseParenItem(
        this.parseSpread(refExpressionErrors),
        spreadNodeStartLoc
      )
    } else {
      elt = this.parseMaybeAssignAllowIn(
        refExpressionErrors,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        this.parseParenItem
      )
    }
    return elt
  }

  // Parse the next token as an identifier. If `liberal` is true (used
  // when parsing properties), it will also convert keywords into
  // identifiers.
  // This shouldn't be used to parse the keywords of meta properties, since they
  // are not identifiers and cannot contain escape sequences.

  parseIdentifier(liberal?: boolean): N.Identifier {
    const node = this.startNode<N.Identifier>()
    const name = this.parseIdentifierName(liberal)

    return this.createIdentifier(node, name)
  }

  createIdentifier(
    node: Omit<N.Identifier, "type">,
    name: string
  ): N.Identifier {
    node.name = name
    node.loc.identifierName = name

    return this.finishNode(node, "Identifier")
  }

  parseIdentifierName(liberal?: boolean): string {
    let name: string = ""

    const { startLoc, type } = this.state

    if (tokenIsKeywordOrIdentifier(type)) {
      name = this.state.value as string
    } else {
      this.unexpected()
    }

    const tokenIsKeyword = tokenKeywordOrIdentifierIsKeyword(type)

    if (liberal ?? false) {
      // If the current token is not used as a keyword, set its type to "tt.name".
      // This will prevent this.next() from throwing about unexpected escapes.
      if (tokenIsKeyword) {
        this.replaceToken(tt.name)
      }
    } else {
      this.checkReservedWord(name, startLoc, tokenIsKeyword)
    }

    this.next()

    return name
  }

  checkReservedWord(
    word: string,
    startLoc: Position,
    checkKeywords: boolean
  ): void {
    // Every JavaScript reserved word is 10 characters or less.
    if (word.length > 10) {
      return
    }
    // Most identifiers are not reservedWord-like, they don't need special
    // treatments afterward, which very likely ends up throwing errors
    if (!canBeReservedWord(word)) {
      return
    }

    if (checkKeywords && isKeyword(word)) {
      this.raise(Errors.UnexpectedKeyword, {
        at: startLoc,
        keyword: word
      })
      return
    }

    if (isReservedWord(word)) {
      this.raise(Errors.UnexpectedReservedWord, {
        at: startLoc,
        reservedWord: word
      })
      return
    }
  }

  isSimpleReference(expression: N.Expression): boolean {
    switch (expression.type) {
      case "MemberExpression":
        return !expression.computed && this.isSimpleReference(expression.object)
      case "Identifier":
        return true
      default:
        return false
    }
  }

  // XXX: unnecessary
  allowInAnd<T>(callback: () => T): T {
    return callback()
  }

  // XXX: unnecessary
  disallowInAnd<T>(callback: () => T): T {
    return callback()
  }
}
