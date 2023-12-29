import * as charCodes from "charcodes"
import { tt, type TokenType } from "../token-types.js"
import type {
  AssignmentPattern,
  Expression,
  Identifier,
  Node,
  Pattern,
  RestElement,
  SpreadElement,
  ObjectProperty,
  ObjectExpression,
  ObjectPattern,
  ArrayPattern,
  Incomplete,
  Annotation,
  EmptyPattern,
  Complete
} from "../../ast/types.js"
import { type Position, type Pos, ZeroPosition } from "../position.js"
import { isReservedWord } from "../keyword.js"
import { NodeParser } from "./node.js"
import { BindingFlag } from "./scope.js"
import type { ExpressionErrors } from "./util.ts"
import { Errors, type LValAncestor } from "../error.js"

const getOwn = <T extends object>(object: T, key: keyof T) =>
  Object.hasOwnProperty.call(object, key) && object[key]

const unwrapParenthesizedExpression = (node: Node): Node => {
  return node.type === "ParenthesizedExpression"
    ? unwrapParenthesizedExpression(node.expression)
    : node
}

export enum ParseBindingListFlags {
  ALLOW_EMPTY = 1 << 0,
  IS_FUNCTION_PARAMS = 1 << 1,
  IS_CONSTRUCTOR_PARAMS = 1 << 2
}

export default abstract class LValParser extends NodeParser {
  // Forward-declaration: defined in expression.js
  abstract parseIdentifier(liberal?: boolean): Complete<Identifier>
  abstract parseMaybeAssign(
    refExpressionErrors?: ExpressionErrors | null,
    // eslint-disable-next-line @typescript-eslint/ban-types
    afterLeftParse?: Function,
    refNeedsArrowPos?: Pos | null
  ): Expression

  abstract parseMaybeAssignAllowIn(
    refExpressionErrors?: ExpressionErrors | null,
    // eslint-disable-next-line @typescript-eslint/ban-types
    afterLeftParse?: Function,
    refNeedsArrowPos?: Pos | null
  ): Expression

  abstract parseObjectLike<T extends ObjectPattern | ObjectExpression>(
    close: TokenType,
    isPattern: boolean,
    refExpressionErrors?: ExpressionErrors
  ): Complete<T>
  abstract parseObjPropValue(
    prop: unknown,
    startLoc: Position | null,
    isPattern: boolean,
    refExpressionErrors?: ExpressionErrors | null
  ): ObjectProperty
  abstract parsePropertyName(
    prop: Incomplete<ObjectProperty>
  ): Expression | Identifier
  // Forward-declaration: defined in statement.js
  abstract parseAnnotation(): Annotation

  /**
   * Convert existing expression atom to assignable pattern
   * if possible. Also checks invalid destructuring targets:
   *
   * - Parenthesized Destructuring patterns
   * - RestElement is not the last element
   * - Missing `=` in assignment pattern
   *
   * NOTE: There is a corresponding "isAssignable" method.
   * When this one is updated, please check if also that one needs to be updated.
   *
   * @param node The expression atom
   * @param isLHS Whether we are parsing a LeftHandSideExpression.
   *              If isLHS is `true`, the following cases are allowed: `[(a)] = [0]`, `[(a.b)] = [0]`
   *              If isLHS is `false`, we are in an arrow function parameters list.
   */
  toAssignable(node: Node, isLHS: boolean = false): void {
    let parenthesized: Node | undefined = undefined
    if (
      node.type === "ParenthesizedExpression" ||
      Boolean(node.extra?.parenthesized)
    ) {
      parenthesized = unwrapParenthesizedExpression(node)
      if (isLHS) {
        // an LHS can be reinterpreted to a binding pattern but not vice versa.
        // therefore a parenthesized identifier is ambiguous until we are sure it is an assignment expression
        // i.e. `([(a) = []] = []) => {}`
        // see also `recordArrowParameterBindingError` signature in packages/babel-parser/src/util/expression-scope.js
        if (parenthesized.type === "Identifier") {
          this.raise(Errors.InvalidParenthesizedAssignment, { at: node })
        } else if (
          parenthesized.type !== "MemberExpression" &&
          !this.isOptionalMemberExpression(parenthesized)
        ) {
          // A parenthesized member expression can be in LHS but not in pattern.
          // If the LHS is later interpreted as a pattern, `checkLVal` will throw for member expression binding
          // i.e. `([(a.b) = []] = []) => {}`
          this.raise(Errors.InvalidParenthesizedAssignment, { at: node })
        }
      } else {
        this.raise(Errors.InvalidParenthesizedAssignment, { at: node })
      }
    }

    switch (node.type) {
      case "Identifier":
      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
      case "RestElement":
        break

      case "ObjectExpression":
        node = node as unknown as ObjectPattern
        node.type = "ObjectPattern"
        for (
          let i = 0, length = node.properties.length, last = length - 1;
          i < length;
          i++
        ) {
          const prop = node.properties[i]
          const isLast = i === last
          this.toAssignableObjectExpressionProp(prop, isLast, isLHS)

          if (
            isLast &&
            prop.type === "RestElement" &&
            // Casting this to Boolean fools typescript's inference.
            //
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            !!node.extra?.trailingCommaLoc
          ) {
            this.raise(Errors.RestTrailingComma, {
              at: node.extra.trailingCommaLoc as Position
            })
          }
        }
        break

      case "ObjectProperty": {
        const { value } = node
        this.toAssignable(value, isLHS)
        break
      }

      case "SpreadElement": {
        throw new Error(
          "Internal parser error (this is a bug, please report it)." +
            " SpreadElement should be converted by .toAssignable's caller."
        )
      }

      case "ArrayExpression": {
        const elements = node.elements
        node = node as unknown as ArrayPattern
        node.type = "ArrayPattern"
        this.toAssignableList(
          elements,
          node.extra?.trailingCommaLoc as Position | undefined,
          isLHS
        )
        break
      }

      case "AssignmentExpression":
        node = node as unknown as AssignmentPattern
        node.type = "AssignmentPattern"
        this.toAssignable(node.left, isLHS)
        break

      case "ParenthesizedExpression":
        /*::invariant (parenthesized !== undefined) */
        this.toAssignable(parenthesized as Node, isLHS)
        break

      default:
      // We don't know how to deal with this node. It will
      // be reported by a later call to checkLVal
    }
  }

  toAssignableObjectExpressionProp(
    prop: Node,
    isLast: boolean,
    isLHS: boolean
  ) {
    if (prop.type === "SpreadElement") {
      prop = prop as unknown as RestElement
      prop.type = "RestElement"
      const arg = prop.argument
      this.checkToRestConversion(arg, /* allowPattern */ false)
      this.toAssignable(arg, isLHS)

      if (!isLast) {
        this.raise(Errors.RestTrailingComma, { at: prop })
      }
    } else {
      this.toAssignable(prop, isLHS)
    }
  }

  // Convert list of expression atoms to binding list.

  toAssignableList(
    exprList: (Expression | SpreadElement | RestElement)[],
    trailingCommaLoc: Position | undefined | null,
    isLHS: boolean
  ): void {
    const end = exprList.length - 1

    for (let i = 0; i <= end; i++) {
      let elt = exprList[i]

      if (elt.type === "SpreadElement") {
        elt = elt as unknown as RestElement
        elt.type = "RestElement"
        const arg = elt.argument
        this.checkToRestConversion(arg, /* allowPattern */ true)
        this.toAssignable(arg, isLHS)
      } else {
        this.toAssignable(elt, isLHS)
      }

      if (elt.type === "RestElement") {
        if (i < end) {
          this.raise(Errors.RestTrailingComma, { at: elt })
        } else if (trailingCommaLoc) {
          this.raise(Errors.RestTrailingComma, { at: trailingCommaLoc })
        }
      }
    }
  }

  isAssignable(node: Node, isBinding?: boolean): boolean {
    switch (node.type) {
      case "Identifier":
      case "ObjectPattern":
      case "ArrayPattern":
      case "AssignmentPattern":
      case "RestElement":
        return true

      case "ObjectExpression": {
        const last = node.properties.length - 1
        return node.properties.every((prop, i) => {
          return (
            (i === last || prop.type !== "SpreadElement") &&
            this.isAssignable(prop)
          )
        })
      }

      case "ObjectProperty":
        return this.isAssignable(node.value)

      case "SpreadElement":
        return this.isAssignable(node.argument)

      case "ArrayExpression":
        return node.elements.every((element) => this.isAssignable(element))

      case "AssignmentExpression":
        return true

      case "ParenthesizedExpression":
        return this.isAssignable(node.expression)

      case "MemberExpression":
        return !(isBinding ?? false)

      default:
        return false
    }
  }

  // Convert list of expression atoms to a list of

  toReferencedList(
    exprList: ReadonlyArray<Expression | undefined | null>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isParenthesizedExpr?: boolean
  ): ReadonlyArray<Expression | undefined | null> {
    return exprList
  }

  toReferencedListDeep(
    exprList: ReadonlyArray<Expression | undefined | null>,
    isParenthesizedExpr?: boolean
  ): void {
    this.toReferencedList(exprList, isParenthesizedExpr)

    for (const expr of exprList) {
      if (expr?.type === "ArrayExpression") {
        this.toReferencedListDeep(expr.elements)
      }
    }
  }

  // Parses spread element.

  parseSpread(refExpressionErrors?: ExpressionErrors | null): SpreadElement {
    const node = this.startNode<SpreadElement>()
    this.next()
    node.argument = this.parseMaybeAssignAllowIn(refExpressionErrors, undefined)
    return this.finishNode(node, "SpreadElement")
  }

  // https://tc39.es/ecma262/#prod-BindingRestProperty
  // https://tc39.es/ecma262/#prod-BindingRestElement
  parseRestBinding(): RestElement {
    const node = this.startNode<RestElement>()
    this.next() // eat `...`
    node.argument = this.parseBindingAtom()
    return this.finishNode(node, "RestElement")
  }

  // Parses lvalue (assignable) atom.
  parseBindingAtom():
    | Complete<ArrayPattern>
    | Complete<ObjectPattern>
    | Complete<Identifier> {
    // https://tc39.es/ecma262/#prod-BindingPattern
    switch (this.state.type) {
      case tt.bracketL: {
        const node = this.startNode<ArrayPattern>()
        this.next()
        node.elements = this.parseBindingList(
          tt.bracketR,
          charCodes.rightSquareBracket,
          ParseBindingListFlags.ALLOW_EMPTY
        )
        return this.finishNode(node, "ArrayPattern")
      }

      case tt.braceL:
        // False positive here.
        //
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        return this.parseObjectLike(tt.braceR, true) as Complete<ObjectPattern>
    }

    // https://tc39.es/ecma262/#prod-BindingIdentifier
    return this.parseIdentifier()
  }

  // https://tc39.es/ecma262/#prod-BindingElementList
  parseBindingList(
    close: TokenType,
    closeCharCode: (typeof charCodes)[keyof typeof charCodes],
    flags: ParseBindingListFlags
  ): Array<Pattern> {
    const allowEmpty = flags & ParseBindingListFlags.ALLOW_EMPTY

    const elts: Array<Pattern> = []
    let first = true
    while (!this.eat(close)) {
      if (first) {
        first = false
      } else {
        this.expect(tt.comma)
      }
      if (allowEmpty && this.match(tt.comma)) {
        const node = this.startNodeAt<EmptyPattern>(this.state.startLoc)
        elts.push(this.finishNode(node, "EmptyPattern"))
      } else if (this.eat(close)) {
        break
      } else if (this.match(tt.ellipsis)) {
        elts.push(
          this.parseAssignableListItemTypes(this.parseRestBinding(), flags)
        )
        if (!this.checkCommaAfterRest(closeCharCode)) {
          this.expect(close)
          break
        }
      } else {
        const annotations: Annotation[] = []
        while (this.match(tt.at)) {
          annotations.push(this.parseAnnotation())
        }
        elts.push(this.parseAssignableListItem(flags, annotations))
      }
    }
    return elts
  }

  // https://tc39.es/ecma262/#prod-BindingRestProperty
  parseBindingRestProperty(prop: Incomplete<RestElement>): RestElement {
    this.next() // eat '...'
    // Don't use parseRestBinding() as we only allow Identifier here.
    prop.argument = this.parseIdentifier()
    this.checkCommaAfterRest(charCodes.rightCurlyBrace)
    return this.finishNode(prop, "RestElement")
  }

  // https://tc39.es/ecma262/#prod-BindingProperty
  parseBindingProperty(): ObjectProperty | RestElement {
    const prop = this.startNode<ObjectProperty | RestElement>()
    const { type, startLoc } = this.state
    if (type === tt.ellipsis) {
      return this.parseBindingRestProperty(prop as Incomplete<RestElement>)
    } else {
      this.parsePropertyName(prop as Incomplete<ObjectProperty>)
    }
    return this.parseObjPropValue(
      prop as Incomplete<ObjectProperty>,
      startLoc,
      true /* isPattern */
    )
  }

  parseAssignableListItem(
    flags: ParseBindingListFlags,
    annotations: Annotation[]
  ): Pattern {
    const left = this.parseMaybeDefault()
    this.parseAssignableListItemTypes(left, flags)
    const elt = this.parseMaybeDefault(left.loc.start, left)
    if (annotations.length && left.type !== "Identifier") {
      left.annotations = annotations
    }
    return elt
  }

  // Used by flow/typescript plugin to add type annotations to binding elements
  parseAssignableListItemTypes(
    param: Pattern,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    flags: ParseBindingListFlags
  ): Pattern {
    return param
  }

  // Parses assignment pattern around given atom if possible.
  // https://tc39.es/ecma262/#prod-BindingElement
  parseMaybeDefault(
    startLoc?: Position | null,
    left?: Complete<Pattern> | null
  ): Complete<Pattern> {
    startLoc ??= this.state.startLoc
    left = left ?? this.parseBindingAtom()
    if (!this.eat(tt.eq)) return left

    const node = this.startNodeAt<AssignmentPattern>(startLoc)
    node.left = left
    node.right = this.parseMaybeAssignAllowIn()
    return this.finishNode(node, "AssignmentPattern")
  }
  /**
   * Return information use in determining whether a Node of a given type is an LVal,
   * possibly given certain additional context information.
   *
   * Subclasser notes: This method has kind of a lot of mixed, but related,
   * responsibilities. If we can definitively determine with the information
   * provided that this either *is* or *isn't* a valid `LVal`, then the return
   * value is easy: just return `true` or `false`. However, if it is a valid
   * LVal *ancestor*, and thus its descendants must be subsequently visited to
   * continue the "investigation", then this method should return the relevant
   * child key as a `string`. In some special cases, you additionally want to
   * convey that this node should be treated as if it were parenthesized. In
   * that case, a tuple of [key: string, parenthesized: boolean] is returned.
   * The `string`-only return option is actually just a shorthand for:
   * `[key: string, parenthesized: false]`.
   *
   * @param type A Node `type` string
   * @param isUnparenthesizedInAssign
   *        Whether the node in question is unparenthesized and its parent
   *        is either an assignment pattern or an assignment expression.
   * @param binding
   *        The binding operation that is being considered for this potential
   *        LVal.
   * @returns `true` or `false` if we can immediately determine whether the node
   *          type in question can be treated as an `LVal`.
   *          A `string` key to traverse if we must check this child.
   *          A `[string, boolean]` tuple if we need to check this child and
   *          treat is as parenthesized.
   */
  isValidLVal(
    type: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isUnparenthesizedInAssign: boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    binding: BindingFlag
  ): [string, boolean] | boolean {
    const key = getOwn(
      {
        AssignmentPattern: "left",
        RestElement: "argument",
        ObjectProperty: "value",
        ParenthesizedExpression: "expression",
        ArrayPattern: "elements",
        ObjectPattern: "properties"
      },
      // @ts-expect-error refine string to enum
      type
    )
    if (key === false) return key
    else return [key, false]
  }

  // Overridden by the estree plugin
  isOptionalMemberExpression(expression: Node) {
    return expression.type === "MemberExpression" && expression.optional
  }

  /**
   * Verify that a target expression is an lval (something that can be assigned to).
   *
   * @param expression The expression in question to check.
   * @param options A set of options described below.
   * @param options.in
   *        The relevant ancestor to provide context information for the error
   *        if the check fails.
   * @param options.binding
   *        The desired binding type. If the given expression is an identifier
   *        and `binding` is not `BindingFlag.TYPE_NONE`, `checkLVal` will register binding
   *        to the parser scope See also `src/util/scopeflags.js`
   * @param options.checkClashes
   *        An optional string set to check if an identifier name is included.
   *        `checkLVal` will add checked identifier name to `checkClashes` It is
   *        used in tracking duplicates in function parameter lists. If it is
   *        false, `checkLVal` will skip duplicate checks
   * @param options.hasParenthesizedAncestor
   *        This is only used internally during recursive calls, and you should
   *        not have to set it yourself.
   */
  checkLVal(
    expression: Expression | ObjectProperty | Pattern,
    {
      in: ancestor,
      binding = BindingFlag.TYPE_NONE,
      checkClashes = false,
      hasParenthesizedAncestor = false
    }: {
      in: LValAncestor
      binding?: BindingFlag
      checkClashes?: Set<string> | false
      hasParenthesizedAncestor?: boolean
    }
  ): void {
    // XXX: this function is miserable, look at fixing it
    const type = expression.type

    // If we find here an ObjectMethod, it's because this was originally
    // an ObjectExpression which has then been converted.
    // toAssignable already reported this error with a nicer message.
    if (this.isObjectMethod(expression)) return

    const isOptionalMemberExpression =
      this.isOptionalMemberExpression(expression)

    if (isOptionalMemberExpression || type === "MemberExpression") {
      if (isOptionalMemberExpression) {
        if (ancestor.type !== "AssignmentExpression") {
          this.raise(Errors.InvalidLhsOptionalChaining, {
            at: expression,
            ancestor
          })
        }
      }

      if (binding !== BindingFlag.TYPE_NONE) {
        this.raise(Errors.InvalidPropertyBindingPattern, { at: expression })
      }
      return
    }

    if (type === "Identifier") {
      this.checkIdentifier(expression, binding)

      const { name } = expression

      // Casting to Boolean fools type inference
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      if (checkClashes) {
        if (checkClashes.has(name)) {
          this.raise(Errors.ParamDupe, { at: expression })
        } else {
          checkClashes.add(name)
        }
      }

      return
    }

    const validity = this.isValidLVal(
      type,
      !(hasParenthesizedAncestor || Boolean(expression.extra?.parenthesized)) &&
        ancestor.type === "AssignmentExpression",
      binding
    )

    if (validity === true) return
    if (validity === false) {
      const ParseErrorClass =
        binding === BindingFlag.TYPE_NONE
          ? Errors.InvalidLhs
          : Errors.InvalidLhsBinding

      this.raise(ParseErrorClass, { at: expression, ancestor })
      return
    }

    const [key, isParenthesizedExpression] = [
      validity[0],
      type === "ParenthesizedExpression"
    ]
    const nextAncestor =
      type === "ArrayPattern" || type === "ObjectPattern"
        ? ({ type } as const)
        : ancestor

    // TODO: what is this nonsense?
    // expression[key] is one of: AssignmentPattern.left, RestElement.argument,
    // ObjectProperty.value, ParentheziedExpression.expression, ArrayPattern.
    // elements, or ObjectPattern.properties.
    //
    // In other words, it is either a node or array of nodes.
    let children: Pattern[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const expressionSubKey = (expression as any)[key] as
      | Pattern
      | Pattern[]
      | undefined
    if (Array.isArray(expressionSubKey)) {
      children = expressionSubKey.slice()
    } else if (expressionSubKey) {
      children = [expressionSubKey]
    }
    for (const child of children) {
      // XXX: type-unsafe here. checkLVal should accept all patterns as arguments but reject invalid ones.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      this.checkLVal(child as any, {
        in: nextAncestor,
        binding,
        checkClashes,
        hasParenthesizedAncestor: isParenthesizedExpression
      })
    }
  }

  checkIdentifier(at: Identifier, bindingType: BindingFlag) {
    if (isReservedWord(at.name)) {
      this.raise(Errors.IllegalReservedWord, { at, reservedWord: at.name })
    }

    if (!(bindingType & BindingFlag.TYPE_NONE)) {
      this.declareNameFromIdentifier(at, bindingType)
    }
  }

  declareNameFromIdentifier(identifier: Identifier, binding: BindingFlag) {
    this.scope.declareName(
      identifier.name,
      binding,
      identifier.loc?.start ?? ZeroPosition
    )
  }

  checkToRestConversion(node: Node, allowPattern: boolean): void {
    switch (node.type) {
      case "ParenthesizedExpression":
        this.checkToRestConversion(node.expression, allowPattern)
        break
      case "Identifier":
      case "MemberExpression":
        break
      case "ArrayExpression":
      // @ts-expect-error Deliberate fallthrough
      case "ObjectExpression":
        if (allowPattern) break
      /* falls through */
      default:
        this.raise(Errors.InvalidRestAssignmentPattern, { at: node })
    }
  }

  checkCommaAfterRest(
    close: (typeof charCodes)[keyof typeof charCodes]
  ): boolean {
    if (!this.match(tt.comma)) {
      return false
    }

    this.raise(
      this.lookaheadCharCode() === close
        ? Errors.RestTrailingComma
        : Errors.ElementAfterRest,
      { at: this.state.startLoc }
    )

    return true
  }
}
