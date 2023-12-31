// Augment AST nodes with info
import { SourceLocation, type Position } from "../parser/position.js"
import type * as T from "./types.js"

////////// Classy nodes
/**
 * Concrete implementation of the abstract TypeScript AST `Node`
 * as a JavaScript class.
 */
export class Node implements T.NodeBase {
  type: string = ""
  declare start: number
  declare end: number
  declare loc: SourceLocation
  declare range: [number, number]
  declare leadingComments: T.Comment[]
  declare trailingComments: T.Comment[]
  declare innerComments: T.Comment[]
  declare extra: {
    [key: string]: unknown
  }

  constructor(
    pos?: number,
    loc?: Position,
    ranges: boolean = false,
    filename?: string
  ) {
    if (pos !== undefined && loc !== undefined) {
      this.start = pos
      this.end = 0
      this.loc = new SourceLocation(loc)
      if (ranges) this.range = [pos, 0]
    }
    if (filename !== undefined) this.loc.filename = filename
  }

  __clone(): Node {
    const newNode = new Node(this.start, this.loc.start)
    const keys = Object.keys(this) as Array<keyof Node>
    for (let i = 0, length = keys.length; i < length; i++) {
      const key = keys[i]
      // Do not clone comments that are already attached to the node
      if (
        key !== "leadingComments" &&
        key !== "trailingComments" &&
        key !== "innerComments"
      ) {
        // @ts-expect-error cloning this to newNode
        newNode[key] = this[key]
      }
    }

    return newNode
  }
}

////////// Metadata
/**
 * Various yes/no categorizations that an AST node can fall under.
 * Note also that each AST node type is an implicit category consisting
 * of nodes with exactly that type.
 */
export enum NodeCategory {
  /**
   * Nodes that have a body consisting of statements
   */
  Body = "Body",

  /**
   * Nodes that introduce a variable scope
   */
  Scope = "Scope",

  /**
   * Nodes that introduce a scope that may also depend on the nature
   * of their parent node.
   */
  ParentScope = "ParentScope",
  Expression = "Expression",
  Statement = "Statement",
  Declaration = "Declaration",
  Literal = "Literal",
  Annotated = "Annotated",
  Loop = "Loop",
  Function = "Function"
}

/**
 * Metadata associated with AST nodes that is not strictly part of
 * the AST. (The `type` is included here for runtime JS concreteness.)
 */
export interface NodeMetadata {
  /**
   * Final AST node type.
   */
  type: T.Node["type"]

  /**
   * Keys to traverse, in order, when recursing into child nodes.
   */
  traverse?: string[]

  /**
   * Category labels to which this node belongs.
   */
  categories?: string[]
}

const nodes: Record<string, NodeMetadata> = {}
const categories: Record<string, Set<string> | undefined> = {}

export function getMetadata(t: T.Node["type"]): NodeMetadata {
  return nodes[t]
}

export type MatchersT = {
  [NodeType in T.Node as `is${NodeType["type"]}`]: (
    n: T.Node | null | undefined
  ) => n is NodeType
}

export const matchers = {} as MatchersT

export type ConstructorsT = {
  [NodeType in T.Node as `${NodeType["type"]}`]: (
    def: Omit<NodeType, "type">
  ) => NodeType
}

export const constructors = {} as ConstructorsT

//////////////// Metadata registration
// Type-check registrations as they're being registered
interface StrictNodeRegistration<NodeT extends T.Node> {
  type: NodeT["type"]
  traverse?: Array<keyof NodeT>
  categories?: NodeCategory[]
}

function registerNode<NodeT extends T.Node>(
  registration: NodeMetadata & StrictNodeRegistration<NodeT>
): void {
  const reg = registration as NodeMetadata
  nodes[reg.type] = reg
  reg.categories = reg.categories
    ? reg.categories.concat([reg.type])
    : [reg.type]
  for (const category of reg.categories) {
    const catSet = categories[category] ?? (categories[category] = new Set())
    catSet.add(reg.type)
  }

  const ist = reg.type

  // Conjure matcher
  // @ts-expect-error This is a logically-sound assignment to the
  // matcher of the corresponding node type.
  matchers[`is${reg.type}`] = function (
    n: T.Node | null | undefined
  ): n is NodeT {
    return n?.type === ist
  }

  // Conjure constructor
  // @ts-expect-error This is a logically-sound assignment
  // to the constructor of the node type.
  constructors[ist] = function (def: Omit<NodeT, "type">): NodeT {
    const newNode = new Node() as unknown as NodeT
    Object.assign(newNode, def)
    newNode.type = ist
    return newNode
  }
}
///////////////////////////// NODES //////////////////////////////////
// These definitions specify runtime metadata for AST nodes
// corresponding to those defined in `types.ts`.
registerNode<T.File>({
  type: "File",
  traverse: ["program"]
})

registerNode<T.Program>({
  type: "Program",
  traverse: ["body"],
  categories: [NodeCategory.Body, NodeCategory.Scope]
})

registerNode<T.Identifier>({
  type: "Identifier",
  categories: [NodeCategory.Expression]
})

registerNode<T.DotPath>({
  type: "DotPath"
})

registerNode<T.NullLiteral>({
  type: "NullLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<T.StringLiteral>({
  type: "StringLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<T.BooleanLiteral>({
  type: "BooleanLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<T.IntLiteral>({
  type: "IntLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<T.FloatLiteral>({
  type: "FloatLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<T.TemplateLiteral>({
  type: "TemplateLiteral",
  traverse: ["quasis", "expressions"],
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<T.UnaryExpression>({
  type: "UnaryExpression",
  traverse: ["argument"],
  categories: [NodeCategory.Expression]
})

registerNode<T.BinaryExpression>({
  type: "BinaryExpression",
  traverse: ["left", "right"],
  categories: [NodeCategory.Expression]
})

registerNode<T.CallExpression>({
  type: "CallExpression",
  traverse: ["callee", "arguments"],
  categories: [NodeCategory.Expression]
})

registerNode<T.MemberExpression>({
  type: "MemberExpression",
  traverse: ["object", "property"],
  categories: [NodeCategory.Expression]
})

registerNode<T.ArrayExpression>({
  type: "ArrayExpression",
  traverse: ["elements"],
  categories: [NodeCategory.Expression]
})

registerNode<T.ObjectExpression>({
  type: "ObjectExpression",
  traverse: ["properties"],
  categories: [NodeCategory.Expression]
})

registerNode<T.ObjectProperty>({
  type: "ObjectProperty",
  traverse: ["annotations", "key", "value"],
  categories: [NodeCategory.Expression, NodeCategory.Annotated]
})

registerNode<T.AssignmentExpression>({
  type: "AssignmentExpression",
  traverse: ["left", "right"],
  categories: [NodeCategory.Expression]
})

registerNode<T.FunctionExpression>({
  type: "FunctionExpression",
  traverse: ["annotations", "name", "parameters", "body"],
  categories: [
    NodeCategory.Expression,
    NodeCategory.Annotated,
    NodeCategory.Scope
  ]
})

registerNode<T.SequenceExpression>({
  type: "SequenceExpression",
  traverse: ["expressions"],
  categories: [NodeCategory.Expression]
})

registerNode<T.ConditionalExpression>({
  type: "ConditionalExpression",
  traverse: ["test", "consequent", "alternate"],
  categories: [NodeCategory.Expression]
})

registerNode<T.TaggedTemplateExpression>({
  type: "TaggedTemplateExpression",
  traverse: ["tag", "quasi"]
})

registerNode<T.EmptyStatement>({
  type: "EmptyStatement",
  categories: [NodeCategory.Statement]
})

registerNode<T.ExpressionStatement>({
  type: "ExpressionStatement",
  traverse: ["expression"],
  categories: [NodeCategory.Statement]
})

registerNode<T.BlockStatement>({
  type: "BlockStatement",
  traverse: ["body"],
  categories: [NodeCategory.Statement]
})

registerNode<T.ReturnStatement>({
  type: "ReturnStatement",
  traverse: ["argument"],
  categories: [NodeCategory.Statement]
})

registerNode<T.ThrowStatement>({
  type: "ThrowStatement",
  traverse: ["argument"],
  categories: [NodeCategory.Statement]
})

registerNode<T.BreakStatement>({
  type: "BreakStatement",
  categories: [NodeCategory.Statement]
})

registerNode<T.ContinueStatement>({
  type: "ContinueStatement",
  categories: [NodeCategory.Statement]
})

registerNode<T.WhileStatement>({
  type: "WhileStatement",
  traverse: ["test", "body"],
  categories: [NodeCategory.Statement, NodeCategory.Loop]
})

registerNode<T.ForStatement>({
  type: "ForStatement",
  traverse: ["init", "test", "update", "body"],
  categories: [NodeCategory.Statement, NodeCategory.Loop]
})

registerNode<T.ForInStatement>({
  type: "ForInStatement",
  traverse: ["var", "iterable", "body"],
  categories: [NodeCategory.Statement, NodeCategory.Loop]
})

registerNode<T.IfStatement>({
  type: "IfStatement",
  traverse: ["test", "consequent", "alternate"],
  categories: [NodeCategory.Statement]
})

registerNode<T.FunctionDeclaration>({
  type: "FunctionDeclaration",
  traverse: ["name", "parameters", "body"],
  categories: [
    NodeCategory.Declaration,
    NodeCategory.Statement,
    NodeCategory.Function
  ]
})

registerNode<T.PackageDeclaration>({
  type: "PackageDeclaration",
  traverse: ["name"],
  categories: [NodeCategory.Declaration]
})

registerNode<T.ImportDeclaration>({
  type: "ImportDeclaration",
  traverse: ["from", "specifiers"],
  categories: [NodeCategory.Declaration]
})

registerNode<T.ImportSpecifier>({
  type: "ImportSpecifier",
  traverse: ["imported", "semver", "as"]
})

registerNode<T.VariableDeclaration>({
  type: "VariableDeclaration",
  traverse: ["annotations", "declarations"],
  categories: [NodeCategory.Declaration, NodeCategory.Annotated]
})

registerNode<T.VariableDeclarator>({
  type: "VariableDeclarator",
  traverse: ["id", "init"]
})

registerNode<T.EmptyPattern>({
  type: "EmptyPattern"
})

registerNode<T.AssignmentPattern>({
  type: "AssignmentPattern",
  traverse: ["left", "right"]
})

registerNode<T.ObjectPattern>({
  type: "ObjectPattern",
  traverse: ["properties"]
})

registerNode<T.RestElement>({
  type: "RestElement",
  traverse: ["argument"]
})

registerNode<T.SpreadElement>({
  type: "SpreadElement",
  traverse: ["argument"]
})

registerNode<T.ArrayPattern>({
  type: "ArrayPattern",
  traverse: ["elements"]
})
