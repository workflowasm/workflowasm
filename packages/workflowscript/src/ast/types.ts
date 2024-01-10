// Pure-type description of the WorkflowScript AST.
//
// When modifying this file, be sure to make the corresponding changes
// to `node.ts`, which contains the runtime information about the node
// types.
import { ParseError } from "../parser/error.js"
import type { SourceLocation } from "../parser/position.js"

//////////////// Tokens
export type TokenType = number

/**
 * Basic properties of a token. (Tokens are not AST nodes.)
 */
export interface Token {
  type: TokenType
  value: unknown
  start: number
  end: number
  loc: SourceLocation
}

//////////////// Comments
/**
 * Basic properties of a comment. (Comments are not AST nodes, but
 * are instead attached to their closest related AST node.)
 */
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

/**
 * A whitespace between nodes that contains comments.
 */
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
  start?: number
  end?: number
  loc?: SourceLocation
  range?: [number, number]
  leadingComments?: Comment[]
  trailingComments?: Comment[]
  innerComments?: Comment[]
  extra?: Record<string, unknown>
}

export interface CallExpressionBase extends NodeBase {
  callee: Expression
  arguments: Expression[]
}

export interface FunctionBase extends NodeBase {
  name?: Identifier
  parameters: Pattern[]
  body: BlockStatement
}

export interface Annotation extends NodeBase {
  type: "Annotation"
  /**
   * The expression describing the annotation, which can be:
   *
   * - An `Identifier` in the case of something like `@annotation fn x() {}`
   * - A `MemberExpression` in the case of `@package.annotation fn x() {}`
   * - A `CallExpression` in the case of `@annotation(arg) fn x() {}`
   */
  expression: Expression
}

export interface AnnotatedNode extends NodeBase {
  annotations?: Annotation[]
}

export interface ParserOutput {
  comments: Comment[]
  errors?: Array<ParseError<unknown>>
  tokens?: Array<Token | Comment>
}

//////////////// Unified node type
/**
 * Any fully-typed node in a WorkflowScript AST.
 */
export type Node =
  | Container
  | Statement
  | Expression
  | Declaration
  | Pattern
  | LooseNode

// Node types that don't fit into major categories
export type LooseNode =
  | ObjectProperty
  | TemplateElement
  | Annotation
  | SwitchCase
  | VariableDeclarator
  | DotPath
  | ImportSpecifier

/**
 * An incomplete node of eventual type `NodeT` produced by the parser. */
export type Incomplete<NodeT extends Node> = Omit<NodeT, "type"> & {
  start: number
  end: number
  loc: SourceLocation
}

/**
 * A complete node of type `NodeT` produced by the parser
 * including source loc info.
 */
export type Complete<NodeT extends Node> = NodeT & {
  start: number
  end: number
  loc: SourceLocation
}

//////////////// Top-Level Containers
export interface File extends NodeBase, ParserOutput {
  type: "File"
  program: Program
}

export interface Program extends NodeBase {
  type: "Program"
  body: Statement[]
}

export type Container = File | Program

//////////////// Identifiers
export interface Identifier extends NodeBase {
  type: "Identifier"
  name: string
}

export interface DotPath extends NodeBase {
  type: "DotPath"
  identifiers: Identifier[]
}

//////////////// Literals
export type Literal =
  | NullLiteral
  | StringLiteral
  | BooleanLiteral
  | IntLiteral
  | FloatLiteral
  | TemplateLiteral

export type PrimitiveValueLiteral =
  | StringLiteral
  | BooleanLiteral
  | IntLiteral
  | FloatLiteral

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

export interface IntLiteral extends NodeBase {
  type: "IntLiteral"
  value: bigint
}

export interface FloatLiteral extends NodeBase {
  type: "FloatLiteral"
  value: number
}

export interface TemplateLiteral extends NodeBase {
  type: "TemplateLiteral"
  quasis: TemplateElement[]
  expressions: Expression[]
}

export interface TemplateElement extends NodeBase {
  type: "TemplateElement"
  tail: boolean
  value: {
    cooked: string
    raw: string
  }
}

////////////// Expressions
export type Expression =
  | Literal
  | Identifier
  | UnaryExpression
  | BinaryExpression
  | CallExpression
  | MemberExpression
  | ArrayExpression
  | ParenthesizedExpression // XXX: eliminate
  | ObjectExpression
  | AssignmentExpression
  | FunctionExpression
  | SequenceExpression
  | ConditionalExpression
  | TaggedTemplateExpression
  // XXX: Spread and Rest are considered expressions because of the Babel
  // parser design, but they probably shouldn't be
  | SpreadElement
  | RestElement

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
  | "??"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="

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
 * A member expression of the form `object.property` or `object[property]`
 */
export interface MemberExpression extends NodeBase {
  type: "MemberExpression"
  object: Expression
  property: Expression
  optional: boolean
  /**
   * True when the expression is bracketed, e.g. `object[property]`. False
   * when the expression is dotted, e.g. `object.property`. In the latter
   * case, `property` is always an `Identifier`.
   */
  computed: boolean
}

export interface ArrayExpression extends NodeBase {
  type: "ArrayExpression"
  elements: Expression[]
}

export interface ObjectExpression extends NodeBase {
  type: "ObjectExpression"
  properties: Array<ObjectProperty | SpreadElement>
}

export interface ObjectProperty extends NodeBase, AnnotatedNode {
  type: "ObjectProperty"
  key: Expression
  value: Expression | Pattern
  computed: boolean
  shorthand: boolean
}

// XXX: eliminate this
export interface ParenthesizedExpression extends NodeBase {
  type: "ParenthesizedExpression"
  expression: Expression
}

export interface AssignmentExpression extends NodeBase {
  type: "AssignmentExpression"
  // XXX: LHS of this should always be Pattern, but the parser does some
  // strange things to arrive at it.
  left: Pattern | Expression
  right: Expression
}

export interface FunctionExpression extends FunctionBase, AnnotatedNode {
  type: "FunctionExpression"
}

export interface SequenceExpression extends NodeBase {
  type: "SequenceExpression"
  expressions: Expression[]
}

export interface ConditionalExpression extends NodeBase {
  type: "ConditionalExpression"
  test: Expression
  alternate: Expression
  consequent: Expression
}

export interface TaggedTemplateExpression extends NodeBase {
  type: "TaggedTemplateExpression"
  tag: Expression
  quasi: TemplateLiteral
}

//////////// Statements
export type Statement =
  | Declaration
  | EmptyStatement
  | ExpressionStatement
  | BlockStatement
  | ReturnStatement
  // XXX: eliminate throw statements, they should be exprs
  | ThrowStatement
  | BreakStatement
  | ContinueStatement
  | WhileStatement
  | ForStatement
  | ForInStatement
  | IfStatement
  // XXX: eliminate switch statements
  | SwitchStatement

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
  argument?: Expression
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
  init?: Expression | VariableDeclaration
  test?: Expression
  update?: Expression
  body: Statement
}

export interface ForInStatement extends NodeBase {
  type: "ForInStatement"
  var: VariableDeclaration | AssignmentPattern
  iterable: Expression
  body: Statement
}

export interface IfStatement extends NodeBase {
  type: "IfStatement"
  test: Expression
  consequent: Statement
  alternate?: Statement
}

export interface SwitchStatement extends NodeBase {
  type: "SwitchStatement"
  discriminant: Expression
  cases: SwitchCase[]
}

export interface SwitchCase extends NodeBase {
  type: "SwitchCase"
  test?: Expression
  consequent: Statement[]
}

////////// Declarations
export type Declaration =
  | FunctionDeclaration
  | PackageDeclaration
  | ImportDeclaration
  | VariableDeclaration

export interface FunctionDeclaration extends FunctionBase, AnnotatedNode {
  type: "FunctionDeclaration"
  name: Identifier
}

export interface PackageDeclaration extends NodeBase {
  type: "PackageDeclaration"
  name: DotPath
}

export interface ImportDeclaration extends NodeBase {
  type: "ImportDeclaration"
  from: DotPath
  specifiers: ImportSpecifier[]
}

export interface ImportSpecifier extends NodeBase {
  type: "ImportSpecifier"
  imported: Identifier
  semver: StringLiteral
  as?: Identifier
}

export type VariableDeclarationKind = "let" | "const"

export interface VariableDeclaration extends NodeBase, AnnotatedNode {
  type: "VariableDeclaration"
  declarations: VariableDeclarator[]
  kind: VariableDeclarationKind
}

export interface VariableDeclarator extends NodeBase {
  type: "VariableDeclarator"
  id: Pattern
  init?: Expression
}

////////// Patterns
export type NonAssignmentPattern =
  | Identifier
  | ObjectPattern
  | ArrayPattern
  | RestElement
  | EmptyPattern

export type Pattern = NonAssignmentPattern | AssignmentPattern

export interface PatternBase extends NodeBase, AnnotatedNode {}

export interface EmptyPattern extends PatternBase {
  type: "EmptyPattern"
}

export interface AssignmentPattern extends PatternBase {
  type: "AssignmentPattern"
  left: Pattern
  right: Expression
}

export interface ObjectPattern extends PatternBase {
  type: "ObjectPattern"
  properties: Array<ObjectProperty | RestElement>
}

export interface RestElement extends PatternBase {
  type: "RestElement"
  argument: Pattern
}

export interface SpreadElement extends NodeBase {
  type: "SpreadElement"
  argument: Expression
}

export interface ArrayPattern extends PatternBase {
  type: "ArrayPattern"
  // XXX: why is undefined allowed here?
  elements: Array<Pattern | undefined>
}

/////// Misc
export type Function = FunctionDeclaration | FunctionExpression
