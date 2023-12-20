import * as N from "../../ast.js"
import { type Incomplete } from "../../ast.js"
import {
  tokenIsIdentifier,
  tokenIsKeywordOrIdentifier,
  tokenIsLoop,
  tokenIsTemplate,
  tt,
  type TokenType,
  getExportedToken
} from "../token-types.js"
import ExpressionParser from "./expression.js"
import { Errors } from "../error.js"
import { isIdentifierChar, isIdentifierStart } from "../identifier.js"
import * as charCodes from "charcodes"
import { ScopeFlag, ClassElementType, BindingFlag } from "./scope.js"
import { ExpressionErrors } from "./util.ts"
import { Token } from "./tokenizer.js"
import type { Position } from "../position.js"
import { ZeroPosition, createPositionWithColumnOffset } from "../position.js"
import { cloneStringLiteral, cloneIdentifier } from "./node.js"
import { ParseBindingListFlags } from "./lval.js"

const loopLabel = { kind: "loop" } as const,
  switchLabel = { kind: "switch" } as const

export enum ParseFunctionFlag {
  Expression = 0b0000,
  Declaration = 0b0001,
  HangingDeclaration = 0b0010,
  NullableId = 0b0100,
  Async = 0b1000
}

export enum ParseStatementFlag {
  StatementOnly = 0b0000,
  AllowImportExport = 0b0001,
  AllowDeclaration = 0b0010,
  AllowFunctionDeclaration = 0b0100,
  AllowLabeledFunction = 0b1000
}

const loneSurrogate = /[\uD800-\uDFFF]/u

const keywordRelationalOperator = /in(?:stanceof)?/y

export default abstract class StatementParser extends ExpressionParser {
  // ### Statement parsing

  // Parse a program. Initializes the parser, reads any number of
  // statements, and wraps them in a Program node.  Optionally takes a
  // `program` argument.  If present, the statements will be appended
  // to its body instead of creating a new node.

  parseTopLevel(file: N.File, program: N.Program): N.File {
    file.program = this.parseProgram(program)
    file.comments = this.state.comments

    if (this.options.tokens) {
      file.tokens = this.tokens
    }

    return this.finishNode(file, "File")
  }

  parseProgram(
    program: Incomplete<N.Program>,
    end: TokenType = tt.eof
  ): N.Program {
    this.parseBlockBody(program, true, true, end)
    if (this.scope.undefinedExports.size > 0) {
      for (const [localName, at] of Array.from(this.scope.undefinedExports)) {
        this.raise(Errors.ModuleExportUndefined, { at, localName })
      }
    }
    let finishedProgram: N.Program
    if (end === tt.eof) {
      // finish at eof for top level program
      finishedProgram = this.finishNode(program, "Program")
    } else {
      // finish immediately before the end token
      finishedProgram = this.finishNodeAt(
        program,
        "Program",
        createPositionWithColumnOffset(this.state.startLoc, -1)
      )
    }
    return finishedProgram
  }

  /**
   * cast a Statement to a Directive. This method mutates input statement.
   */
  stmtToDirective(stmt: N.Statement): N.Directive {
    const directive = stmt as any
    directive.type = "Directive"
    directive.value = directive.expression
    delete directive.expression

    const directiveLiteral = directive.value
    const expressionValue = directiveLiteral.value
    const raw = this.input.slice(directiveLiteral.start, directiveLiteral.end)
    const val = (directiveLiteral.value = raw.slice(1, -1)) // remove quotes

    this.addExtra(directiveLiteral, "raw", raw)
    this.addExtra(directiveLiteral, "rawValue", val)
    this.addExtra(directiveLiteral, "expressionValue", expressionValue)

    directiveLiteral.type = "DirectiveLiteral"

    return directive
  }

  isLet(): boolean {
    if (!this.isContextual(tt._let)) {
      return false
    }
    return this.hasFollowingBindingAtom()
  }

  chStartsBindingIdentifier(ch: number, pos: number) {
    if (isIdentifierStart(ch)) {
      keywordRelationalOperator.lastIndex = pos
      if (keywordRelationalOperator.test(this.input)) {
        // We have seen `in` or `instanceof` so far, now check if the identifier
        // ends here
        const endCh = this.codePointAtPos(keywordRelationalOperator.lastIndex)
        if (!isIdentifierChar(endCh) && endCh !== charCodes.backslash) {
          return false
        }
      }
      return true
    } else if (ch === charCodes.backslash) {
      return true
    } else {
      return false
    }
  }

  chStartsBindingPattern(ch: number) {
    return ch === charCodes.leftSquareBracket || ch === charCodes.leftCurlyBrace
  }

  /**
   * Assuming we have seen a contextual `let` and declaration is allowed, check if it
   * starts a variable declaration so that it should be interpreted as a keyword.
   */
  hasFollowingBindingAtom(): boolean {
    const next = this.nextTokenStart()
    const nextCh = this.codePointAtPos(next)
    return (
      this.chStartsBindingPattern(nextCh) ||
      this.chStartsBindingIdentifier(nextCh, next)
    )
  }

  /**
   * Assuming we have seen a contextual `using` and declaration is allowed, check if it
   * starts a variable declaration in the same line so that it should be interpreted as
   * a keyword.
   */
  hasInLineFollowingBindingIdentifier(): boolean {
    const next = this.nextTokenInLineStart()
    const nextCh = this.codePointAtPos(next)
    return this.chStartsBindingIdentifier(nextCh, next)
  }

  // https://tc39.es/ecma262/#prod-ModuleItem
  parseModuleItem() {
    return this.parseStatementLike(
      ParseStatementFlag.AllowImportExport |
        ParseStatementFlag.AllowDeclaration |
        ParseStatementFlag.AllowFunctionDeclaration |
        // This function is actually also used to parse StatementItems,
        // which with Annex B enabled allows labeled functions.
        ParseStatementFlag.AllowLabeledFunction
    )
  }

  // https://tc39.es/ecma262/#prod-StatementListItem
  parseStatementListItem() {
    return this.parseStatementLike(
      ParseStatementFlag.AllowDeclaration |
        ParseStatementFlag.AllowFunctionDeclaration
    )
  }

  parseStatementOrSloppyAnnexBFunctionDeclaration() {
    let flags: ParseStatementFlag = ParseStatementFlag.StatementOnly
    return this.parseStatementLike(flags)
  }

  // Parse a single statement.
  //
  // If expecting a statement and finding a slash operator, parse a
  // regular expression literal. This is to handle cases like
  // `if (foo) /blah/.exec(foo)`, where looking at the previous token
  // does not help.
  // https://tc39.es/ecma262/#prod-Statement
  parseStatement() {
    return this.parseStatementLike(ParseStatementFlag.StatementOnly)
  }

  // ImportDeclaration and ExportDeclaration are also handled here so we can throw recoverable errors
  // when they are not at the top level
  parseStatementLike(
    flags: ParseStatementFlag
  ): N.Statement | N.Declaration | N.ImportDeclaration {
    let annotations: N.Annotation[] | undefined = undefined

    if (this.match(tt.at)) {
      annotations = this.parseAnnotations(true)
    }
    return this.parseStatementContent(flags, annotations)
  }

  parseStatementContent(
    flags: ParseStatementFlag,
    annotations?: N.Annotation[]
  ): N.Statement {
    const starttype = this.state.type
    const node = this.startNode<N.Statement>()
    const allowDeclaration = !!(flags & ParseStatementFlag.AllowDeclaration)
    const allowFunctionDeclaration = !!(
      flags & ParseStatementFlag.AllowFunctionDeclaration
    )
    const topLevel = flags & ParseStatementFlag.AllowImportExport

    // Most types of statements are recognized by the keyword they
    // start with. Many are trivial to parse, some require a bit of
    // complexity.

    switch (starttype) {
      case tt._break:
        return this.parseBreakContinueStatement(
          node as Incomplete<N.BreakStatement>,
          /* isBreak */ true
        )
      case tt._continue:
        return this.parseBreakContinueStatement(
          node as Incomplete<N.ContinueStatement>,
          /* isBreak */ false
        )
      case tt._for:
        return this.parseForStatement(node as Incomplete<N.ForStatement>)
      case tt._fn:
        if (this.lookaheadCharCode() === charCodes.dot) break
        if (!allowFunctionDeclaration) {
          this.raise(Errors.UnexpectedDeclaration, { at: this.state.startLoc })
        }
        return this.parseFunctionStatement(
          node as Incomplete<N.FunctionDeclaration>,
          false,
          !allowDeclaration && allowFunctionDeclaration
        )
      case tt._if:
        return this.parseIfStatement(node as Incomplete<N.IfStatement>)
      case tt._return:
        return this.parseReturnStatement(node as Incomplete<N.ReturnStatement>)
      case tt._throw:
        return this.parseThrowStatement(node as Incomplete<N.ThrowStatement>)

      case tt._let: {
        if (this.state.containsEsc) {
          break
        }
        // `let [` is an explicit negative lookahead for
        // ExpressionStatement, so special-case it first.
        const next = this.nextTokenStart()
        const nextCh = this.codePointAtPos(next)
        if (nextCh !== charCodes.leftSquareBracket) {
          if (!allowDeclaration && this.hasFollowingLineBreak()) break
          if (
            !this.chStartsBindingIdentifier(nextCh, next) &&
            nextCh !== charCodes.leftCurlyBrace
          ) {
            break
          }
        }
      }
      // fall through
      case tt._const: {
        if (!allowDeclaration) {
          this.raise(Errors.UnexpectedDeclaration, {
            at: this.state.startLoc
          })
        }

        const kind = this.state.value
        return this.parseVarStatement(
          node as Incomplete<N.VariableDeclaration>,
          kind as N.VariableDeclarationKind
        )
      }
      case tt._while:
        return this.parseWhileStatement(node as Incomplete<N.WhileStatement>)
      case tt.braceL:
        return this.parseBlock()
      case tt.semi:
        return this.parseEmptyStatement(node as Incomplete<N.EmptyStatement>)
      case tt._import: {
        // XXX: this appears to be irrelevant
        const nextTokenCharCode = this.lookaheadCharCode()
        if (
          nextTokenCharCode === charCodes.leftParenthesis || // import()
          nextTokenCharCode === charCodes.dot // import.meta
        ) {
          break
        }

        if (!topLevel) {
          this.unexpected()
        }

        this.next() // eat `import`/`export`

        let result

        result = this.parseImport(node as Incomplete<N.ImportDeclaration>)

        return result
      }

      default:
      // Deliberately empty
    }
    // ExpressionStatement
    const expr = this.parseExpression()

    return this.parseExpressionStatement(
      node as Incomplete<N.ExpressionStatement>,
      expr,
      annotations
    )
  }

  canHaveLeadingDecorator(): boolean {
    return this.match(tt._class)
  }

  parseAnnotations(allowExport?: boolean): N.Annotation[] {
    const annotations: N.Annotation[] = []
    do {
      annotations.push(this.parseAnnotation())
    } while (this.match(tt.at))

    // XXX: seems irrelevant, test
    // if (this.match(tt._export)) {
    //   if (!allowExport) {
    //     this.unexpected()
    //   }
    // } else if (!this.canHaveLeadingDecorator()) {
    //   throw this.raise(Errors.UnexpectedLeadingDecorator, {
    //     at: this.state.startLoc
    //   })
    // }

    return annotations
  }

  parseAnnotation(): N.Annotation {
    const node = this.startNode<N.Annotation>()
    this.next()

    const startLoc = this.state.startLoc
    let expr: N.Expression

    expr = this.parseIdentifier(false)

    while (this.eat(tt.dot)) {
      const node = this.startNodeAt<N.MemberExpression>(startLoc)
      node.object = expr
      node.property = this.parseIdentifier(true)
      node.computed = false
      expr = this.finishNode(node, "MemberExpression")
    }

    node.expression = this.parseMaybeAnnotationArguments(expr)

    return this.finishNode(node, "Annotation")
  }

  parseMaybeAnnotationArguments(expr: N.Expression): N.Expression {
    if (this.eat(tt.parenL)) {
      const node = this.startNodeAtNode<N.CallExpression>(expr)
      node.callee = expr
      node.arguments = this.parseCallExpressionArguments(tt.parenR)
      this.toReferencedList(node.arguments)
      return this.finishNode(node, "CallExpression")
    }

    return expr
  }

  parseBreakContinueStatement(
    node: Incomplete<N.BreakStatement>,
    isBreak: true
  ): N.BreakStatement
  parseBreakContinueStatement(
    node: Incomplete<N.ContinueStatement>,
    isBreak: false
  ): N.ContinueStatement
  parseBreakContinueStatement(
    node: Incomplete<N.BreakStatement | N.ContinueStatement>,
    isBreak: boolean
  ): N.BreakStatement | N.ContinueStatement {
    this.next()
    this.semicolon()

    // XXX: check for validity of break/continue

    return this.finishNode(
      node,
      isBreak ? "BreakStatement" : "ContinueStatement"
    )
  }

  parseHeaderExpression(): N.Expression {
    this.expect(tt.parenL)
    const val = this.parseExpression()
    this.expect(tt.parenR)
    return val
  }

  // Disambiguating between a `for` and a `for`/`in` or `for`/`of`
  // loop is non-trivial. Basically, we have to parse the init `var`
  // statement or expression, disallowing the `in` operator (see
  // the second parameter to `parseExpression`), and then check
  // whether the next token is `in` or `of`. When there is no init
  // part (semicolon immediately after the opening parenthesis), it
  // is a regular `for` loop.

  parseForStatement(
    node: Incomplete<N.ForStatement | N.ForInStatement>
  ): N.ForStatement | N.ForInStatement {
    this.next()
    this.state.labels.push(loopLabel)

    this.scope.enter(ScopeFlag.OTHER)
    this.expect(tt.parenL)

    if (this.match(tt.semi)) {
      return this.parseFor(node as Incomplete<N.ForStatement>, undefined)
    }

    const startsWithLet = this.isContextual(tt._let)
    {
      const isLet = startsWithLet && this.hasFollowingBindingAtom()

      if (this.match(tt._const) || isLet) {
        const initNode = this.startNode<N.VariableDeclaration>()
        let kind
        kind = this.state.value
        this.next()
        this.parseVar(initNode, true, kind)
        const init = this.finishNode(initNode, "VariableDeclaration")

        const isForIn = this.match(tt._in)
        if (isForIn && init.declarations.length === 1) {
          return this.parseForIn(node as Incomplete<N.ForInStatement>, init)
        }

        return this.parseFor(node as Incomplete<N.ForStatement>, init)
      }
    }

    // Check whether the first token is possibly a contextual keyword, so that
    // we can forbid `for (async of` if this turns out to be a for-of loop.
    const refExpressionErrors = new ExpressionErrors()
    const init = this.parseExpression(true, refExpressionErrors)
    if (this.match(tt._in)) {
      this.toAssignable(init, /* isLHS */ true)
      const type = "ForInStatement"
      this.checkLVal(init, { in: { type } })
      return this.parseForIn(
        node as Incomplete<N.ForInStatement>,
        // @ts-expect-error init has been transformed to an assignable
        init
      )
    } else {
      this.checkExpressionErrors(refExpressionErrors, true)
    }

    return this.parseFor(node as Incomplete<N.ForStatement>, init)
  }

  // https://tc39.es/ecma262/#prod-HoistableDeclaration
  parseFunctionStatement(
    node: Incomplete<N.FunctionDeclaration>,
    isAsync: boolean,
    isHangingDeclaration: boolean
  ): N.FunctionDeclaration {
    this.next() // eat 'function'
    return this.parseFunction(
      node,
      ParseFunctionFlag.Declaration |
        (isHangingDeclaration ? ParseFunctionFlag.HangingDeclaration : 0) |
        (isAsync ? ParseFunctionFlag.Async : 0)
    )
  }

  // https://tc39.es/ecma262/#prod-IfStatement
  parseIfStatement(node: Incomplete<N.IfStatement>) {
    this.next()
    node.test = this.parseHeaderExpression()
    // Annex B.3.3
    // https://tc39.es/ecma262/#sec-functiondeclarations-in-ifstatement-statement-clauses
    node.consequent = this.parseStatementOrSloppyAnnexBFunctionDeclaration()
    node.alternate = this.eat(tt._else)
      ? this.parseStatementOrSloppyAnnexBFunctionDeclaration()
      : undefined
    return this.finishNode(node, "IfStatement")
  }

  parseReturnStatement(node: Incomplete<N.ReturnStatement>) {
    // XXX: bring back prodParam for this
    //
    // if (!this.prodParam.hasReturn && !this.options.allowReturnOutsideFunction) {
    //   this.raise(Errors.IllegalReturn, { at: this.state.startLoc })
    // }

    this.next()

    // In `return` (and `break`/`continue`), the keywords with
    // optional arguments, we eagerly look for a semicolon or the
    // possibility to insert one.

    if (this.isLineTerminator()) {
      node.argument = undefined
    } else {
      node.argument = this.parseExpression()
      this.semicolon()
    }

    return this.finishNode(node, "ReturnStatement")
  }

  parseThrowStatement(node: Incomplete<N.ThrowStatement>) {
    this.next()
    if (this.hasPrecedingLineBreak()) {
      this.raise(Errors.UnexpectedToken, {
        at: this.state.lastTokEndLoc ?? ZeroPosition,
        unexpected: "\\n"
      })
    }
    node.argument = this.parseExpression()
    this.semicolon()
    return this.finishNode(node, "ThrowStatement")
  }

  // https://tc39.es/ecma262/#prod-VariableStatement
  // https://tc39.es/ecma262/#prod-LexicalDeclaration
  parseVarStatement(
    node: Incomplete<N.VariableDeclaration>,
    kind: "let" | "const",
    allowMissingInitializer: boolean = false
  ): N.VariableDeclaration {
    this.next()
    this.parseVar(node, false, kind, allowMissingInitializer)
    this.semicolon()
    return this.finishNode(node, "VariableDeclaration")
  }

  // https://tc39.es/ecma262/#prod-WhileStatement
  parseWhileStatement(node: Incomplete<N.WhileStatement>): N.WhileStatement {
    this.next()
    node.test = this.parseHeaderExpression()
    this.state.labels.push(loopLabel)

    // Parse the loop body.
    node.body = this.parseStatement()

    this.state.labels.pop()

    return this.finishNode(node, "WhileStatement")
  }

  parseEmptyStatement(node: Incomplete<N.EmptyStatement>): N.EmptyStatement {
    this.next()
    return this.finishNode(node, "EmptyStatement")
  }

  parseExpressionStatement(
    node: Incomplete<N.ExpressionStatement>,
    expr: N.Expression,
    /* eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in TypeScript parser */
    annotations?: N.Annotation[]
  ) {
    node.expression = expr
    this.semicolon()
    return this.finishNode(node, "ExpressionStatement")
  }

  parseBlock(
    createNewLexicalScope: boolean = true,
    afterBlockParse?: (hasStrictModeDirective: boolean) => void
  ): N.BlockStatement {
    const node = this.startNode<N.BlockStatement>()

    this.expect(tt.braceL)
    if (createNewLexicalScope) {
      this.scope.enter(ScopeFlag.OTHER)
    }
    this.parseBlockBody(node, false, tt.braceR, afterBlockParse)
    if (createNewLexicalScope) {
      this.scope.exit()
    }
    return this.finishNode(node, "BlockStatement")
  }

  parseBlockBody(
    node: Incomplete<N.BlockStatement>,
    topLevel: boolean,
    end: TokenType,
    afterBlockParse?: (hasStrictModeDirective: boolean) => void
  ): void {
    const body: N.BlockStatement["body"] = (node.body = [])
    this.parseBlockOrModuleBlockBody(body, topLevel, end, afterBlockParse)
  }

  // Undefined directives means that directives are not allowed.
  // https://tc39.es/ecma262/#prod-Block
  // https://tc39.es/ecma262/#prod-ModuleBody
  parseBlockOrModuleBlockBody(
    body: N.Statement[],
    topLevel: boolean,
    end: TokenType,
    afterBlockParse?: (hasStrictModeDirective: boolean) => void
  ): void {
    let hasStrictModeDirective = false

    while (!this.match(end)) {
      const stmt = topLevel
        ? this.parseModuleItem()
        : this.parseStatementListItem()

      body.push(stmt)
    }

    afterBlockParse?.call(this, hasStrictModeDirective)

    this.next()
  }

  // Parse a regular `for` loop. The disambiguation code in
  // `parseStatement` will already have parsed the init statement or
  // expression.

  parseFor(
    node: Incomplete<N.ForStatement>,
    init?: N.VariableDeclaration | N.Expression
  ): N.ForStatement {
    node.init = init
    this.semicolon(/* allowAsi */ false)
    node.test = this.match(tt.semi) ? undefined : this.parseExpression()
    this.semicolon(/* allowAsi */ false)
    node.update = this.match(tt.parenR) ? undefined : this.parseExpression()
    this.expect(tt.parenR)

    // Parse the loop body.
    node.body = this.parseStatement()

    // parseStatement pushes these, we pop them here.
    this.scope.exit()
    this.state.labels.pop()

    return this.finishNode(node, "ForStatement")
  }

  // Parse a `for`/`in` and `for`/`of` loop, which are almost
  // same from parser's perspective.

  parseForIn(
    node: Incomplete<N.ForInStatement>,
    init: N.VariableDeclaration | N.AssignmentPattern
  ): N.ForInStatement {
    this.expect(tt._in)

    if (
      init.type === "VariableDeclaration" &&
      init.declarations[0].init != null
    ) {
      this.raise(Errors.ForInLoopInitializer, {
        at: init
      })
    }

    if (init.type === "AssignmentPattern") {
      this.raise(Errors.InvalidLhs, {
        at: init,
        ancestor: { type: "ForStatement" }
      })
    }

    node.var = init
    node.iterable = this.parseExpression()
    this.expect(tt.parenR)

    // Parse the loop body.
    node.body = this.parseStatement()

    this.scope.exit()
    this.state.labels.pop()

    return this.finishNode(node, "ForInStatement")
  }

  // Parse a list of variable declarations.

  parseVar(
    node: Incomplete<N.VariableDeclaration>,
    isFor: boolean,
    kind: N.VariableDeclarationKind,
    allowMissingInitializer: boolean = false
  ): Incomplete<N.VariableDeclaration> {
    const declarations: N.VariableDeclarator[] = (node.declarations = [])
    node.kind = kind
    for (;;) {
      const decl = this.startNode<N.VariableDeclarator>()
      this.parseVarId(decl, kind)
      decl.init = !this.eat(tt.eq)
        ? undefined
        : isFor
          ? this.parseMaybeAssignDisallowIn()
          : this.parseMaybeAssignAllowIn()

      if (decl.init === null && !allowMissingInitializer) {
        if (
          decl.id.type !== "Identifier" &&
          !(isFor && (this.match(tt._in) || this.isContextual(tt._of)))
        ) {
          this.raise(Errors.DeclarationMissingInitializer, {
            at: this.state.lastTokEndLoc ?? ZeroPosition
          })
        } else if (
          kind === "const" &&
          !(this.match(tt._in) || this.isContextual(tt._of))
        ) {
          this.raise(Errors.DeclarationMissingInitializer, {
            at: this.state.lastTokEndLoc ?? ZeroPosition
          })
        }
      }
      declarations.push(this.finishNode(decl, "VariableDeclarator"))
      if (!this.eat(tt.comma)) break
    }
    return node
  }

  parseVarId(
    decl: Incomplete<N.VariableDeclarator>,
    kind: N.VariableDeclarationKind
  ): void {
    const id = this.parseBindingAtom()
    this.checkLVal(id, {
      in: { type: "VariableDeclarator" },
      binding: BindingFlag.TYPE_LEXICAL
    })
    decl.id = id
  }

  // Parse a function declaration or expression (depending on the
  // ParseFunctionFlag.Declaration flag).

  parseFunction<T extends N.Function>(
    node: Incomplete<T>,
    flags: ParseFunctionFlag = ParseFunctionFlag.Expression
  ): T {
    const hangingDeclaration = flags & ParseFunctionFlag.HangingDeclaration
    const isDeclaration = !!(flags & ParseFunctionFlag.Declaration)
    const requireId = isDeclaration && !(flags & ParseFunctionFlag.NullableId)

    this.initFunction(node)

    if (isDeclaration) {
      node.name = this.parseFunctionId(requireId)
    }

    this.scope.enter(ScopeFlag.FUNCTION)
    // XXX: restore prodParam
    //this.prodParam.enter(functionFlags(isAsync, node.generator))

    if (!isDeclaration) {
      node.name = this.parseFunctionId()
    }

    this.parseFunctionParams(node)

    this.parseFunctionBodyAndFinish(
      node,
      isDeclaration ? "FunctionDeclaration" : "FunctionExpression"
    )

    // XXX: restore prodParam
    //this.prodParam.exit()
    this.scope.exit()

    if (isDeclaration && !hangingDeclaration) {
      // We need to register this _after_ parsing the function body
      // because of TypeScript body-less function declarations,
      // which shouldn't be added to the scope.
      this.registerFunctionStatementId(node as T)
    }

    return node as T
  }

  parseFunctionId(requireId?: boolean): N.Identifier | undefined {
    return requireId || tokenIsIdentifier(this.state.type)
      ? this.parseIdentifier()
      : undefined
  }

  parseFunctionParams(node: Incomplete<N.Function>): void {
    this.expect(tt.parenL)
    node.parameters = this.parseBindingList(
      tt.parenR,
      charCodes.rightParenthesis,
      ParseBindingListFlags.IS_FUNCTION_PARAMS
    )
  }

  registerFunctionStatementId(node: N.Function): void {
    if (!node.name) return

    this.scope.declareName(
      node.name.name,
      BindingFlag.TYPE_LEXICAL,
      node.name.loc.start
    )
  }

  checkDeclaration(node: N.Pattern | N.ObjectProperty): void {
    if (node.type === "Identifier") {
      // XXX: probably unnecessary, compiler will do this
      // this.checkDuplicateExports(node, node.name)
    } else if (node.type === "ObjectPattern") {
      for (const prop of node.properties) {
        this.checkDeclaration(prop)
      }
    } else if (node.type === "ArrayPattern") {
      for (const elem of node.elements) {
        if (elem) {
          this.checkDeclaration(elem)
        }
      }
    } else if (node.type === "ObjectProperty") {
      // @ts-expect-error migrate to Babel types
      this.checkDeclaration(node.value)
    } else if (node.type === "RestElement") {
      this.checkDeclaration(node.argument)
    } else if (node.type === "AssignmentPattern") {
      this.checkDeclaration(node.left)
    }
  }

  // XXX: rewrite import parings
  // Parses import declaration.
  // https://tc39.es/ecma262/#prod-ImportDeclaration
  parseImport(node: Incomplete<N.ImportDeclaration>): N.ImportDeclaration {
    if (this.match(tt.string)) {
      // import '...'
      return this.parseImportSourceAndAttributes(node)
    }

    return this.parseImportSpecifiersAndAfter(
      node,
      this.parseMaybeImportPhase(node, /* isExport */ false)
    )
  }

  parseImportSourceAndAttributes(
    node: Incomplete<N.ImportDeclaration>
  ): N.AnyImport {
    node.specifiers ??= []
    node.source = this.parseImportSource()
    this.maybeParseImportAttributes(node)
    this.checkImportReflection(node)
    this.checkJSONModuleImport(node)

    this.semicolon()
    return this.finishNode(node, "ImportDeclaration")
  }

  parseImportSource(this: Parser): N.StringLiteral {
    if (!this.match(tt.string)) this.unexpected()
    return this.parseExprAtom() as N.StringLiteral
  }

  parseImportSpecifierLocal<
    T extends
      | N.ImportSpecifier
      | N.ImportDefaultSpecifier
      | N.ImportNamespaceSpecifier
  >(
    node: Undone<N.ImportDeclaration>,
    specifier: Undone<T>,
    type: T["type"]
  ): void {
    specifier.local = this.parseIdentifier()
    node.specifiers.push(this.finishImportSpecifier(specifier, type))
  }

  finishImportSpecifier<
    T extends
      | N.ImportSpecifier
      | N.ImportDefaultSpecifier
      | N.ImportNamespaceSpecifier
  >(
    specifier: Undone<T>,
    type: T["type"],
    bindingType: BindingFlag = BindingFlag.TYPE_LEXICAL
  ) {
    this.checkLVal(specifier.local, {
      in: { type },
      binding: bindingType
    })
    return this.finishNode(specifier, type)
  }

  /**
   * parse assert entries
   *
   * @see {@link https://tc39.es/proposal-import-attributes/#prod-WithEntries WithEntries}
   */
  parseImportAttributes(): N.ImportAttribute[] {
    this.expect(tt.braceL)

    const attrs = []
    const attrNames = new Set()

    do {
      if (this.match(tt.braceR)) {
        break
      }

      const node = this.startNode<N.ImportAttribute>()

      // parse AssertionKey : IdentifierName, StringLiteral
      const keyName = this.state.value
      // check if we already have an entry for an attribute
      // if a duplicate entry is found, throw an error
      // for now this logic will come into play only when someone declares `type` twice
      if (attrNames.has(keyName)) {
        this.raise(Errors.ModuleAttributesWithDuplicateKeys, {
          at: this.state.startLoc,
          key: keyName
        })
      }
      attrNames.add(keyName)
      if (this.match(tt.string)) {
        node.key = this.parseStringLiteral(keyName)
      } else {
        node.key = this.parseIdentifier(true)
      }
      this.expect(tt.colon)

      if (!this.match(tt.string)) {
        throw this.raise(Errors.ModuleAttributeInvalidValue, {
          at: this.state.startLoc
        })
      }
      node.value = this.parseStringLiteral(this.state.value)
      attrs.push(this.finishNode(node, "ImportAttribute"))
    } while (this.eat(tt.comma))

    this.expect(tt.braceR)

    return attrs
  }

  /**
   * parse module attributes
   * @deprecated It will be removed in Babel 8
   */
  parseModuleAttributes() {
    const attrs: N.ImportAttribute[] = []
    const attributes = new Set()
    do {
      const node = this.startNode<N.ImportAttribute>()
      node.key = this.parseIdentifier(true)

      if (node.key.name !== "type") {
        this.raise(Errors.ModuleAttributeDifferentFromType, {
          at: node.key
        })
      }

      if (attributes.has(node.key.name)) {
        this.raise(Errors.ModuleAttributesWithDuplicateKeys, {
          at: node.key,
          key: node.key.name
        })
      }
      attributes.add(node.key.name)
      this.expect(tt.colon)
      if (!this.match(tt.string)) {
        throw this.raise(Errors.ModuleAttributeInvalidValue, {
          at: this.state.startLoc
        })
      }
      node.value = this.parseStringLiteral(this.state.value)
      attrs.push(this.finishNode(node, "ImportAttribute"))
    } while (this.eat(tt.comma))

    return attrs
  }

  maybeParseImportAttributes(
    node: Undone<N.ImportDeclaration | N.ExportNamedDeclaration>
  ) {
    let attributes: N.ImportAttribute[]
    let useWith = false

    // https://tc39.es/proposal-import-attributes/#prod-WithClause
    if (this.match(tt._with)) {
      if (
        this.hasPrecedingLineBreak() &&
        this.lookaheadCharCode() === charCodes.leftParenthesis
      ) {
        // This will be parsed as a with statement, and we will throw a
        // better error about it not being supported in strict mode.
        return
      }

      this.next() // eat `with`

      if (!process.env.BABEL_8_BREAKING) {
        if (this.hasPlugin("moduleAttributes")) {
          attributes = this.parseModuleAttributes()
        } else {
          this.expectImportAttributesPlugin()
          attributes = this.parseImportAttributes()
        }
      } else {
        this.expectImportAttributesPlugin()
        attributes = this.parseImportAttributes()
      }
      useWith = true
    } else if (this.isContextual(tt._assert) && !this.hasPrecedingLineBreak()) {
      if (this.hasPlugin("importAttributes")) {
        if (
          this.getPluginOption("importAttributes", "deprecatedAssertSyntax") !==
          true
        ) {
          this.raise(Errors.ImportAttributesUseAssert, {
            at: this.state.startLoc
          })
        }
        this.addExtra(node, "deprecatedAssertSyntax", true)
      } else {
        this.expectOnePlugin(["importAttributes", "importAssertions"])
      }
      this.next() // eat `assert`
      attributes = this.parseImportAttributes()
    } else if (
      this.hasPlugin("importAttributes") ||
      this.hasPlugin("importAssertions")
    ) {
      attributes = []
    } else if (!process.env.BABEL_8_BREAKING) {
      if (this.hasPlugin("moduleAttributes")) {
        attributes = []
      } else return
    } else return

    if (!useWith && this.hasPlugin("importAssertions")) {
      node.assertions = attributes
    } else {
      node.attributes = attributes
    }
  }

  maybeParseDefaultImportSpecifier(
    node: Undone<N.ImportDeclaration>,
    maybeDefaultIdentifier: N.Identifier | null
  ): boolean {
    // import defaultObj, { x, y as z } from '...'
    if (maybeDefaultIdentifier) {
      const specifier = this.startNodeAtNode<N.ImportDefaultSpecifier>(
        maybeDefaultIdentifier
      )
      specifier.local = maybeDefaultIdentifier
      node.specifiers.push(
        this.finishImportSpecifier(specifier, "ImportDefaultSpecifier")
      )
      return true
    } else if (
      // We allow keywords, and parseImportSpecifierLocal will report a recoverable error
      tokenIsKeywordOrIdentifier(this.state.type)
    ) {
      this.parseImportSpecifierLocal(
        node,
        this.startNode<N.ImportDefaultSpecifier>(),
        "ImportDefaultSpecifier"
      )
      return true
    }
    return false
  }

  maybeParseStarImportSpecifier(node: Undone<N.ImportDeclaration>): boolean {
    if (this.match(tt.star)) {
      const specifier = this.startNode<N.ImportNamespaceSpecifier>()
      this.next()
      this.expectContextual(tt._as)

      this.parseImportSpecifierLocal(
        node,
        specifier,
        "ImportNamespaceSpecifier"
      )
      return true
    }
    return false
  }

  parseNamedImportSpecifiers(node: Undone<N.ImportDeclaration>) {
    let first = true
    this.expect(tt.braceL)
    while (!this.eat(tt.braceR)) {
      if (first) {
        first = false
      } else {
        // Detect an attempt to deep destructure
        if (this.eat(tt.colon)) {
          throw this.raise(Errors.DestructureNamedImport, {
            at: this.state.startLoc
          })
        }

        this.expect(tt.comma)
        if (this.eat(tt.braceR)) break
      }

      const specifier = this.startNode<N.ImportSpecifier>()
      const importedIsString = this.match(tt.string)
      const isMaybeTypeOnly = this.isContextual(tt._type)
      specifier.imported = this.parseModuleExportName()
      const importSpecifier = this.parseImportSpecifier(
        specifier,
        importedIsString,
        node.importKind === "type" || node.importKind === "typeof",
        isMaybeTypeOnly,
        undefined
      )
      node.specifiers.push(importSpecifier)
    }
  }

  // https://tc39.es/ecma262/#prod-ImportSpecifier
  parseImportSpecifier(
    specifier: Undone<N.ImportSpecifier>,
    importedIsString: boolean,
    /* eslint-disable @typescript-eslint/no-unused-vars -- used in TypeScript and Flow parser */
    isInTypeOnlyImport: boolean,
    isMaybeTypeOnly: boolean,
    bindingType: BindingFlag | undefined
    /* eslint-enable @typescript-eslint/no-unused-vars */
  ): N.ImportSpecifier {
    if (this.eatContextual(tt._as)) {
      specifier.local = this.parseIdentifier()
    } else {
      const { imported } = specifier
      if (importedIsString) {
        throw this.raise(Errors.ImportBindingIsString, {
          at: specifier,
          importName: (imported as N.StringLiteral).value
        })
      }
      this.checkReservedWord(
        (imported as N.Identifier).name,
        specifier.loc.start,
        true,
        true
      )
      if (!specifier.local) {
        specifier.local = cloneIdentifier(imported)
      }
    }
    return this.finishImportSpecifier(specifier, "ImportSpecifier", bindingType)
  }
}
