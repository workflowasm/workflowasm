import { ParseError } from "./parser/error.js"
import type { SourceLocation } from "./parser/position.js"

//////////////// Tokens
export type TokenType = number

export interface Token {
  type: TokenType
  value: unknown
  start: number
  end: number
  loc: SourceLocation
}

//////////////// Comments
interface CommentBase {
  type: "CommentBlock" | "CommentLine"
  value: string
  start: number
  end: number
  loc: SourceLocation
}

export interface CommentBlock extends CommentBase {
  type: "CommentBlock"
}

export interface CommentLine extends CommentBase {
  type: "CommentLine"
}

export type Comment = CommentBlock | CommentLine

// A whitespace containing comments
export interface CommentWhitespace {
  start: number
  end: number
  comments: Comment[]
  leadingNode?: Node
  trailingNode?: Node
  containingNode?: Node
}

//////////////// Base Types
export interface NodeBase {
  start: number
  end: number
  loc: SourceLocation
  leadingComments?: Comment[]
  trailingComments?: Comment[]
  innerComments?: Comment[]
  extra?: Record<string, unknown>
}

export interface CallExpressionBase extends NodeBase {
  callee: Expression
  arguments: Expression[]
}

export type Parameter = Identifier

export interface FunctionBase extends NodeBase {
  name?: Identifier
  parameters: Parameter[]
  body: BlockStatement
}

export interface Annotation extends NodeBase {
  type: "Annotation"
  annotation: Identifier
  arguments?: StringLiteral[]
}

export interface AnnotatedNode extends NodeBase {
  annotations?: Annotation[]
}

export interface ParserOutput {
  comments: Comment[]
  errors: ParseError<unknown>[]
  tokens?: (Token | Comment)[]
}

//////////////// Unified node type
export type Node = Statement | Expression | Declaration

export type Incomplete<NodeT extends Node> = Omit<NodeT, "type">

//////////////// Identifiers
export interface Identifier extends NodeBase {
  type: "Identifier"
  name: string
}

/**
 * Nodes of the form "a.b", whether they be expressions
 * or package names.
 */
export interface DotPath extends NodeBase {
  type: "DotPath"
  qualifier?: DotPath
  name: Identifier
}

export type QualifiedName = Identifier | DotPath

//////////////// Literals
export type Literal =
  | NullLiteral
  | StringLiteral
  | BooleanLiteral
  | NumericLiteral
  | DecimalLiteral

export interface NullLiteral extends NodeBase {
  type: "NullLiteral"
}

export interface StringLiteral extends NodeBase {
  type: "StringLiteral"
  value: string
}

export interface BooleanLiteral extends NodeBase {
  type: "BooleanLiteral"
  value: boolean
}

export interface NumericLiteral extends NodeBase {
  type: "NumericLiteral"
  value: bigint
}

export interface DecimalLiteral extends NodeBase {
  type: "DecimalLiteral"
  value: number
}

////////////// Expressions
export type Expression =
  | QualifiedName
  | Literal
  | UnaryExpression
  | BinaryExpression
  | CallExpression
  | MemberExpression
  | IndexExpression

export type UnaryOperator = "-" | "!"

export interface UnaryExpression extends NodeBase {
  type: "UnaryExpression"
  operator: UnaryOperator
  prefix: boolean
  argument: Expression
}

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  | "&&"
  | "||"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">= "

export interface BinaryExpression extends NodeBase {
  type: "BinaryExpression"
  operator: BinaryOperator
  left: Expression
  right: Expression
}

export interface CallExpression extends CallExpressionBase {
  type: "CallExpression"
  optional: boolean
  try: boolean
}

/**
 * A member expression of the form `object.property`
 */
export interface MemberExpression extends NodeBase {
  type: "MemberExpression"
  object: Identifier | MemberExpression
  property: Identifier
  optional: boolean
}

/**
 * An index expression of the form `object[property]`
 */
export interface IndexExpression extends NodeBase {
  type: "IndexExpression"
  object: Expression
  property: Expression
  optional: boolean
}

export interface ArrayExpression extends NodeBase {
  type: "ArrayExpression"
  elements: Expression[]
}

//////////// Statements
export type Statement =
  | EmptyStatement
  | ExpressionStatement
  | BlockStatement
  | ReturnStatement
  | ThrowStatement
  | BreakStatement
  | ContinueStatement
  | WhileStatement
  | ForStatement
  | ForInStatement

export interface EmptyStatement extends NodeBase {
  type: "EmptyStatement"
}

export interface ExpressionStatement extends NodeBase {
  type: "ExpressionStatement"
  expression: Expression
}

export interface BlockStatement extends NodeBase {
  type: "BlockStatement"
  body: Statement[]
}

export interface ReturnStatement extends NodeBase {
  type: "ReturnStatement"
  argument: Expression | undefined
}

export interface ThrowStatement extends NodeBase {
  type: "ThrowStatement"
  argument: Expression
}

export interface BreakStatement extends NodeBase {
  type: "BreakStatement"
  label: Identifier | undefined
}

export interface ContinueStatement extends NodeBase {
  type: "ContinueStatement"
  label: Identifier | undefined
}

export interface WhileStatement extends NodeBase {
  type: "WhileStatement"
  test: Expression
  body: Statement
}

export interface ForStatement extends NodeBase {
  type: "ForStatement"
  init: Expression
  test: Expression
  update: Expression
  body: Statement
}

export interface ForInStatement extends NodeBase {
  type: "ForInStatement"
  var: Expression
  iterable: Expression
  body: Statement
}

////////// Declarations
export type Declaration =
  | FunctionDeclaration
  | PackageDeclaration
  | ImportDeclaration

export interface FunctionDeclaration extends FunctionBase, AnnotatedNode {
  type: "FunctionDeclaration"
  name: Identifier
}

export interface PackageDeclaration extends NodeBase {
  type: "PackageDeclaration"
  name: Identifier
}

export interface ImportDeclaration extends NodeBase {
  type: "ImportDeclaration"
  from: Identifier
}
