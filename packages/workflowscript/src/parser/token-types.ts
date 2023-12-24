/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import { type TokenType } from "../ast.js"

export { type TokenType }

// ## Token types

// The assignment of fine-grained, information-carrying type objects
// allows the tokenizer to store the information it has about a
// token in a way that is very cheap for the parser to look up.

// All token type variables start with an underscore, to make them
// easy to recognize.

// The `beforeExpr` property is used to disambiguate between 1) binary
// expression (<) and JSX Tag start (<name>); 2) object literal and JSX
// texts. It is set on the `updateContext` function in the JSX plugin.

// The `startsExpr` property is used to determine whether an expression
// may be the “argument” subexpression of a `yield` expression or
// `yield` statement. It is set on all token types that may be at the
// start of a subexpression.

// `isLoop` marks a keyword as starting a loop, which is important
// to know when parsing a label, in order to allow or disallow
// continue jumps to that label.

const beforeExpr = true
const startsExpr = true
const isLoop = true
const isAssign = true
const prefix = true

type TokenOptions = {
  keyword?: string
  beforeExpr?: boolean
  startsExpr?: boolean
  rightAssociative?: boolean
  isLoop?: boolean
  isAssign?: boolean
  prefix?: boolean
  postfix?: boolean
  binop?: number
}

// The `ExportedTokenType` is exported via `tokTypes` and accessible
// when `tokens: true` is enabled. Unlike internal token type, it provides
// metadata of the tokens.
export class ExportedTokenType {
  label: string
  keyword: string | undefined
  beforeExpr: boolean
  startsExpr: boolean
  rightAssociative: boolean
  isLoop: boolean
  isAssign: boolean
  prefix: boolean
  postfix: boolean
  binop: number | undefined
  updateContext?: (context: Array<TokContext>) => void

  constructor(label: string, conf: TokenOptions = {}) {
    this.label = label
    this.keyword = conf.keyword
    this.beforeExpr = !!conf.beforeExpr
    this.startsExpr = !!conf.startsExpr
    this.rightAssociative = !!conf.rightAssociative
    this.isLoop = !!conf.isLoop
    this.isAssign = !!conf.isAssign
    this.prefix = !!conf.prefix
    this.postfix = !!conf.postfix
    this.binop = conf.binop ?? undefined
  }
}

// A map from keyword/keyword-like string value to the token type
export const keywords = new Map<string, TokenType>()

function createKeyword(name: string, options: TokenOptions = {}): TokenType {
  options.keyword = name
  const token = createToken(name, options)
  keywords.set(name, token)
  return token
}

function createBinop(name: string, binop: number) {
  return createToken(name, { beforeExpr, binop })
}

let tokenTypeCounter = -1
export const tokenTypes: ExportedTokenType[] = []
const tokenLabels: string[] = []
const tokenBinops: number[] = []
const tokenBeforeExprs: boolean[] = []
const tokenStartsExprs: boolean[] = []
const tokenPrefixes: boolean[] = []

function createToken(name: string, options: TokenOptions = {}): TokenType {
  ++tokenTypeCounter
  tokenLabels.push(name)
  tokenBinops.push(options.binop ?? -1)
  tokenBeforeExprs.push(options.beforeExpr ?? false)
  tokenStartsExprs.push(options.startsExpr ?? false)
  tokenPrefixes.push(options.prefix ?? false)
  tokenTypes.push(new ExportedTokenType(name, options))

  return tokenTypeCounter
}

function createKeywordLike(
  name: string,
  options: TokenOptions = {}
): TokenType {
  ++tokenTypeCounter
  keywords.set(name, tokenTypeCounter)
  tokenLabels.push(name)
  tokenBinops.push(options.binop ?? -1)
  tokenBeforeExprs.push(options.beforeExpr ?? false)
  tokenStartsExprs.push(options.startsExpr ?? false)
  tokenPrefixes.push(options.prefix ?? false)
  // In the exported token type, we set the label as "name" for backward compatibility with Babel 7
  tokenTypes.push(new ExportedTokenType("name", options))

  return tokenTypeCounter
}

// For performance the token type helpers depend on the following declarations order.
// When adding new token types, please also check if the token helpers need update.

export type InternalTokenTypes = typeof tt

export const tt = {
  // Punctuation token types.
  bracketL: createToken("[", { beforeExpr, startsExpr }),
  bracketR: createToken("]"),
  braceL: createToken("{", { beforeExpr, startsExpr }),
  braceR: createToken("}"),
  parenL: createToken("(", { beforeExpr, startsExpr }),
  parenR: createToken(")"),
  comma: createToken(",", { beforeExpr }),
  semi: createToken(";", { beforeExpr }),
  colon: createToken(":", { beforeExpr }),
  dot: createToken("."),
  question: createToken("?", { beforeExpr }),
  questionDot: createToken("?."),
  ellipsis: createToken("...", { beforeExpr }),
  backQuote: createToken("`", { startsExpr }),
  dollarBraceL: createToken("${", { beforeExpr, startsExpr }),
  // start: isTemplate
  templateTail: createToken("...`", { startsExpr }),
  templateNonTail: createToken("...${", { beforeExpr, startsExpr }),
  // end: isTemplate
  at: createToken("@"),
  hash: createToken("#", { startsExpr }),

  // Operators. These carry several kinds of properties to help the
  // parser use them properly (the presence of these properties is
  // what categorizes them as operators).
  //
  // `binop`, when present, specifies that this operator is a binary
  // operator, and will refer to its precedence.
  //
  // `prefix` and `postfix` mark the operator as a prefix or postfix
  // unary operator.
  //
  // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
  // binary operators with a very low precedence, that should result
  // in AssignmentExpression nodes.

  // start: isAssign
  eq: createToken("=", { beforeExpr, isAssign }),
  // end: isAssign

  bang: createToken("!", { beforeExpr, prefix, startsExpr }),

  // start: isBinop
  nullishCoalescing: createBinop("??", 1),
  logicalOR: createBinop("||", 1),
  logicalAND: createBinop("&&", 2),
  equality: createBinop("==/!=", 6),
  lt: createBinop("</>/<=/>=", 7),
  gt: createBinop("</>/<=/>=", 7),
  relational: createBinop("</>/<=/>=", 7),
  plusMin: createToken("+/-", { beforeExpr, binop: 9, prefix, startsExpr }),
  // startsExpr: required by v8intrinsic plugin
  modulo: createToken("%", { binop: 10, startsExpr }),
  // unset `beforeExpr` as it can be `function *`
  star: createToken("*", { binop: 10 }),
  slash: createBinop("/", 10),
  exponent: createToken("**", {
    beforeExpr,
    binop: 11,
    rightAssociative: true
  }),

  // Keywords
  // Don't forget to update packages/babel-helper-validator-identifier/src/keyword.js
  // when new keywords are added
  // start: isLiteralPropertyName
  // start: isKeyword
  _in: createKeyword("in", { beforeExpr, binop: 7 }),
  _instanceof: createKeyword("instanceof", { beforeExpr, binop: 7 }),
  // end: isBinop
  _break: createKeyword("break"),
  _case: createKeyword("case", { beforeExpr }),
  _catch: createKeyword("catch"),
  _continue: createKeyword("continue"),
  _debugger: createKeyword("debugger"),
  _else: createKeyword("else", { beforeExpr }),
  _fn: createKeyword("fn", { startsExpr }),
  _if: createKeyword("if"),
  _return: createKeyword("return", { beforeExpr }),
  _throw: createKeyword("throw", { beforeExpr, prefix, startsExpr }),
  _try: createKeyword("try"),
  _const: createKeyword("const"),
  _new: createKeyword("new", { beforeExpr, startsExpr }),
  _this: createKeyword("this", { startsExpr }),
  _super: createKeyword("super", { startsExpr }),
  _class: createKeyword("class", { startsExpr }),
  _extends: createKeyword("extends", { beforeExpr }),
  _import: createKeyword("import", { startsExpr }),
  _null: createKeyword("null", { startsExpr }),
  _true: createKeyword("true", { startsExpr }),
  _false: createKeyword("false", { startsExpr }),
  _typeof: createKeyword("typeof", { beforeExpr, prefix, startsExpr }),
  _void: createKeyword("void", { beforeExpr, prefix, startsExpr }),
  _delete: createKeyword("delete", { beforeExpr, prefix, startsExpr }),
  // start: isLoop
  _for: createKeyword("for", { isLoop }),
  _while: createKeyword("while", { isLoop }),
  // end: isLoop
  // end: isKeyword

  // Primary literals
  // start: isIdentifier
  _as: createKeywordLike("as", { startsExpr }),
  _assert: createKeywordLike("assert", { startsExpr }),
  _async: createKeywordLike("async", { startsExpr }),
  _await: createKeywordLike("await", { startsExpr }),
  _defer: createKeywordLike("defer", { startsExpr }),
  _from: createKeywordLike("from", { startsExpr }),
  _get: createKeywordLike("get", { startsExpr }),
  _let: createKeywordLike("let", { startsExpr }),
  _meta: createKeywordLike("meta", { startsExpr }),
  _of: createKeywordLike("of", { startsExpr }),
  _sent: createKeywordLike("sent", { startsExpr }),
  _set: createKeywordLike("set", { startsExpr }),
  _source: createKeywordLike("source", { startsExpr }),
  _static: createKeywordLike("static", { startsExpr }),
  _using: createKeywordLike("using", { startsExpr }),
  _yield: createKeywordLike("yield", { startsExpr }),
  _ver: createKeywordLike("ver", { startsExpr }),

  // Flow and TypeScript Keywordlike
  _global: createKeywordLike("global", { startsExpr }),
  _implements: createKeywordLike("implements", { startsExpr }),
  _is: createKeywordLike("is", { startsExpr }),
  _require: createKeywordLike("require", { startsExpr }),
  // start: isTSDeclarationStart
  _abstract: createKeywordLike("abstract", { startsExpr }),
  _enum: createKeywordLike("enum", { startsExpr }),
  _module: createKeywordLike("module", { startsExpr }),
  _namespace: createKeywordLike("namespace", { startsExpr }),
  // start: isFlowInterfaceOrTypeOrOpaque
  _interface: createKeywordLike("interface", { startsExpr }),
  _type: createKeywordLike("type", { startsExpr }),
  // end: isTSDeclarationStart
  // end: isFlowInterfaceOrTypeOrOpaque
  name: createToken("name", { startsExpr }),
  // end: isIdentifier

  string: createToken("string", { startsExpr }),
  int: createToken("int", { startsExpr }),
  float: createToken("float", { startsExpr }),
  // end: isLiteralPropertyName
  eof: createToken("eof")
} as const

export function tokenIsIdentifier(token: TokenType): boolean {
  return token >= tt._as && token <= tt.name
}

export function tokenKeywordOrIdentifierIsKeyword(token: TokenType): boolean {
  // we can remove the token >= tt._in check when we
  // know a token is either keyword or identifier
  return token <= tt._while
}

export function tokenIsKeywordOrIdentifier(token: TokenType): boolean {
  return token >= tt._in && token <= tt.name
}

export function tokenIsLiteralPropertyName(token: TokenType): boolean {
  return token >= tt._in && token <= tt.float
}

export function tokenComesBeforeExpression(token: TokenType): boolean {
  return tokenBeforeExprs[token]
}

export function tokenCanStartExpression(token: TokenType): boolean {
  return tokenStartsExprs[token]
}

export function tokenIsAssignment(token: TokenType): boolean {
  return token === tt.eq
}

export function tokenIsLoop(token: TokenType): boolean {
  return token >= tt._for && token <= tt._while
}

export function tokenIsKeyword(token: TokenType): boolean {
  return token >= tt._in && token <= tt._while
}

export function tokenIsOperator(token: TokenType): boolean {
  return token >= tt.nullishCoalescing && token <= tt._instanceof
}

export function tokenIsPostfix(_token: TokenType): boolean {
  return false
}

export function tokenIsPrefix(token: TokenType): boolean {
  return tokenPrefixes[token]
}

export function tokenLabelName(token: TokenType): string {
  return tokenLabels[token]
}

export function tokenOperatorPrecedence(token: TokenType): number {
  return tokenBinops[token]
}

export function tokenIsBinaryOperator(token: TokenType): boolean {
  return tokenBinops[token] !== -1
}

export function tokenIsRightAssociative(token: TokenType): boolean {
  return token === tt.exponent
}

export function tokenIsTemplate(token: TokenType): boolean {
  return token >= tt.templateTail && token <= tt.templateNonTail
}

export function getExportedToken(token: TokenType): ExportedTokenType {
  return tokenTypes[token]
}

export function isTokenType(obj: unknown): obj is TokenType {
  return typeof obj === "number"
}

// Context. This is used to track nesting of braces and templates.
export class TokContext {
  constructor(token: string, preserveSpace?: boolean) {
    this.token = token
    this.preserveSpace = !!preserveSpace
  }

  token: string
  preserveSpace: boolean
}

export const ct: Record<string, TokContext> = {
  brace: new TokContext("{"),
  template: new TokContext("`", true)
}

tokenTypes[tt.braceR].updateContext = (context) => {
  context.pop()
}

tokenTypes[tt.braceL].updateContext = (context) => {
  context.push(ct.brace)
}

tokenTypes[tt.backQuote].updateContext = (context) => {
  if (context[context.length - 1] === ct.template) {
    context.pop()
  } else {
    context.push(ct.template)
  }
}
