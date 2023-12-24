import UtilParser from "./util.js"
import { SourceLocation, type Position, ZeroPosition } from "../position.js"
import type {
  Comment,
  Node as NodeType,
  NodeBase,
  Incomplete,
  Identifier
} from "../../ast.js"

// Start an AST node, attaching a start offset.

class Node implements NodeBase {
  constructor(parser: NodeParser | undefined, pos: number, loc: Position) {
    this.start = pos
    this.end = 0
    this.loc = new SourceLocation(loc)
    if (parser?.options.ranges ?? false) this.range = [pos, 0]
    if (parser?.filename !== undefined) this.loc.filename = parser.filename
  }

  type: string = ""
  declare start: number
  declare end: number
  declare loc: SourceLocation
  declare range: [number, number]
  declare leadingComments: Array<Comment>
  declare trailingComments: Array<Comment>
  declare innerComments: Array<Comment>
  declare extra: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
}
const NodePrototype = Node.prototype

// @ts-expect-error __clone is not defined in Node prototype
NodePrototype.__clone = function (): Node {
  const newNode = new Node(undefined, this.start, this.loc.start)
  const keys = Object.keys(this) as (keyof Node)[]
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

export function cloneIdentifier<T extends Identifier>(node: T): T {
  // We don't need to clone `typeAnnotations` and `optional`: because
  // cloneIdentifier is only used in object shorthand and named import/export.
  // Neither of them allow type annotations after the identifier or optional identifier
  const { type, start, end, loc, range, extra, name } = node
  const cloned = Object.create(NodePrototype) as T
  cloned.type = type
  cloned.start = start
  cloned.end = end
  cloned.loc = loc
  cloned.range = range
  cloned.extra = extra
  cloned.name = name

  return cloned
}

export abstract class NodeParser extends UtilParser {
  startNode<T extends NodeType>(): Incomplete<T> {
    // @ts-expect-error cast Node as Incomplete<T>
    return new Node(this, this.state.start, this.state.startLoc)
  }

  startNodeAt<T extends NodeType>(loc: Position): Incomplete<T> {
    // @ts-expect-error cast Node as Incomplete<T>
    return new Node(this, loc.index, loc)
  }

  /** Start a new node with a previous node's location. */
  startNodeAtNode<T extends NodeType>(
    type: Incomplete<NodeType>
  ): Incomplete<T> {
    return this.startNodeAt(type.loc.start)
  }

  // Finish an AST node, adding `type` and `end` properties.

  finishNode<T extends NodeType>(node: Incomplete<T>, type: T["type"]): T {
    return this.finishNodeAt(
      node,
      type,
      this.state.lastTokEndLoc ?? ZeroPosition
    )
  }

  // Finish node at given position

  finishNodeAt<T extends NodeType>(
    node: Incomplete<T>,
    type: T["type"],
    endLoc: Position
  ): T {
    if (process.env.NODE_ENV !== "production" && node.end > 0) {
      throw new Error(
        "Do not call finishNode*() twice on the same node." +
          " Instead use resetEndLocation() or change type directly."
      )
    }
    // @ts-expect-error migrate to Babel types AST typings
    node.type = type
    node.end = endLoc.index
    node.loc.end = endLoc
    if (this.options.ranges && !!node.range) node.range[1] = endLoc.index
    if (this.options.attachComment) this.processComment(node as T)
    return node as T
  }

  resetStartLocation(node: NodeBase, startLoc: Position): void {
    node.start = startLoc.index
    node.loc.start = startLoc
    if (this.options.ranges && !!node.range) node.range[0] = startLoc.index
  }

  resetEndLocation(
    node: NodeBase,
    endLoc: Position = this.state.lastTokEndLoc ?? ZeroPosition
  ): void {
    node.end = endLoc.index
    node.loc.end = endLoc
    if (this.options.ranges && !!node.range) node.range[1] = endLoc.index
  }

  /**
   * Reset the start location of node to the start location of locationNode
   */
  resetStartLocationFromNode(node: NodeBase, locationNode: NodeBase): void {
    this.resetStartLocation(node, locationNode.loc.start)
  }
}
