// Augment AST nodes with info
import * as N from "./types.js"
import { type Node } from "./types.js"

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
  type: Node["type"]

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

export function getMetadata(t: Node["type"]): NodeMetadata {
  return nodes[t]
}

//////////////// Metadata registration
// Type-check registrations as they're being registered
interface StrictNodeRegistration<T extends Node> {
  type: T["type"]
  traverse?: (keyof T)[]
  categories?: NodeCategory[]
}

function registerNode<T extends Node>(
  registration: NodeMetadata & StrictNodeRegistration<T>
): { is: (n: Node) => n is T } {
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
  return {
    is(n: Node | null | undefined): n is T {
      return n?.type === ist
    }
  }
}

const { is: isFile } = registerNode<N.File>({
  type: "File",
  traverse: ["program"]
})
export { isFile }

registerNode<N.Program>({
  type: "Program",
  traverse: ["body"],
  categories: [NodeCategory.Body, NodeCategory.Scope]
})

registerNode<N.Identifier>({
  type: "Identifier",
  categories: [NodeCategory.Expression]
})

registerNode<N.DotPath>({
  type: "DotPath"
})

registerNode<N.NullLiteral>({
  type: "NullLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<N.StringLiteral>({
  type: "StringLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<N.BooleanLiteral>({
  type: "BooleanLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<N.IntLiteral>({
  type: "IntLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<N.FloatLiteral>({
  type: "FloatLiteral",
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<N.TemplateLiteral>({
  type: "TemplateLiteral",
  traverse: ["quasis", "expressions"],
  categories: [NodeCategory.Expression, NodeCategory.Literal]
})

registerNode<N.UnaryExpression>({
  type: "UnaryExpression",
  traverse: ["argument"],
  categories: [NodeCategory.Expression]
})

registerNode<N.BinaryExpression>({
  type: "BinaryExpression",
  traverse: ["left", "right"],
  categories: [NodeCategory.Expression]
})

registerNode<N.CallExpression>({
  type: "CallExpression",
  traverse: ["callee", "arguments"],
  categories: [NodeCategory.Expression]
})

registerNode<N.MemberExpression>({
  type: "MemberExpression",
  traverse: ["object", "property"],
  categories: [NodeCategory.Expression]
})

registerNode<N.ArrayExpression>({
  type: "ArrayExpression",
  traverse: ["elements"],
  categories: [NodeCategory.Expression]
})

registerNode<N.ObjectExpression>({
  type: "ObjectExpression",
  traverse: ["properties"],
  categories: [NodeCategory.Expression]
})

registerNode<N.ObjectProperty>({
  type: "ObjectProperty",
  traverse: ["annotations", "key", "value"],
  categories: [NodeCategory.Expression, NodeCategory.Annotated]
})

registerNode<N.AssignmentExpression>({
  type: "AssignmentExpression",
  traverse: ["left", "right"],
  categories: [NodeCategory.Expression]
})

registerNode<N.FunctionExpression>({
  type: "FunctionExpression",
  traverse: ["annotations", "name", "parameters", "body"],
  categories: [
    NodeCategory.Expression,
    NodeCategory.Annotated,
    NodeCategory.Scope
  ]
})

registerNode<N.SequenceExpression>({
  type: "SequenceExpression",
  traverse: ["expressions"],
  categories: [NodeCategory.Expression]
})

registerNode<N.ConditionalExpression>({
  type: "ConditionalExpression",
  traverse: ["test", "consequent", "alternate"],
  categories: [NodeCategory.Expression]
})

registerNode<N.TaggedTemplateExpression>({
  type: "TaggedTemplateExpression",
  traverse: ["tag", "quasi"]
})

registerNode<N.EmptyStatement>({
  type: "EmptyStatement",
  categories: [NodeCategory.Statement]
})

registerNode<N.ExpressionStatement>({
  type: "ExpressionStatement",
  traverse: ["expression"],
  categories: [NodeCategory.Statement]
})

registerNode<N.BlockStatement>({
  type: "BlockStatement",
  traverse: ["body"],
  categories: [NodeCategory.Statement]
})

registerNode<N.ReturnStatement>({
  type: "ReturnStatement",
  traverse: ["argument"],
  categories: [NodeCategory.Statement]
})

registerNode<N.ThrowStatement>({
  type: "ThrowStatement",
  traverse: ["argument"],
  categories: [NodeCategory.Statement]
})

registerNode<N.BreakStatement>({
  type: "BreakStatement",
  categories: [NodeCategory.Statement]
})

registerNode<N.ContinueStatement>({
  type: "ContinueStatement",
  categories: [NodeCategory.Statement]
})

registerNode<N.WhileStatement>({
  type: "WhileStatement",
  traverse: ["test", "body"],
  categories: [NodeCategory.Statement, NodeCategory.Loop]
})

registerNode<N.ForStatement>({
  type: "ForStatement",
  traverse: ["init", "test", "update", "body"],
  categories: [NodeCategory.Statement, NodeCategory.Loop]
})

registerNode<N.ForInStatement>({
  type: "ForInStatement",
  traverse: ["var", "iterable", "body"],
  categories: [NodeCategory.Statement, NodeCategory.Loop]
})

registerNode<N.IfStatement>({
  type: "IfStatement",
  traverse: ["test", "consequent", "alternate"],
  categories: [NodeCategory.Statement]
})

registerNode<N.FunctionDeclaration>({
  type: "FunctionDeclaration",
  traverse: ["name", "parameters", "body"],
  categories: [
    NodeCategory.Declaration,
    NodeCategory.Statement,
    NodeCategory.Function
  ]
})

registerNode<N.PackageDeclaration>({
  type: "PackageDeclaration",
  traverse: ["name"],
  categories: [NodeCategory.Declaration]
})

registerNode<N.ImportDeclaration>({
  type: "ImportDeclaration",
  traverse: ["from", "specifiers"],
  categories: [NodeCategory.Declaration]
})

registerNode<N.ImportSpecifier>({
  type: "ImportSpecifier",
  traverse: ["imported", "semver", "as"]
})

registerNode<N.VariableDeclaration>({
  type: "VariableDeclaration",
  traverse: ["annotations", "declarations"],
  categories: [NodeCategory.Declaration, NodeCategory.Annotated]
})

registerNode<N.VariableDeclarator>({
  type: "VariableDeclarator",
  traverse: ["id", "init"]
})

registerNode<N.EmptyPattern>({
  type: "EmptyPattern"
})

registerNode<N.AssignmentPattern>({
  type: "AssignmentPattern",
  traverse: ["left", "right"]
})

registerNode<N.ObjectPattern>({
  type: "ObjectPattern",
  traverse: ["properties"]
})

registerNode<N.RestElement>({
  type: "RestElement",
  traverse: ["argument"]
})

const { is: isSpreadElement } = registerNode<N.SpreadElement>({
  type: "SpreadElement",
  traverse: ["argument"]
})
export { isSpreadElement }

const { is: isArrayPattern } = registerNode<N.ArrayPattern>({
  type: "ArrayPattern",
  traverse: ["elements"]
})
export { isArrayPattern }
