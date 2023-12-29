import UtilParser from "./util.js"
import { type Position, ZeroPosition } from "../position.js"
import type {
  Node as NodeType,
  NodeBase,
  Incomplete,
  Identifier
} from "../../ast/types.js"
import { Node } from "../../ast/node.js"

export function cloneIdentifier<T extends Identifier>(node: T): T {
  // We don't need to clone `typeAnnotations` and `optional`: because
  // cloneIdentifier is only used in object shorthand and named import/export.
  // Neither of them allow type annotations after the identifier or optional identifier
  const { type, start, end, loc, range, extra, name } = node
  const cloned = Object.create(Node.prototype) as T
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
    return new Node(
      this.state.start,
      this.state.startLoc,
      this.options.ranges,
      this.filename
    ) as unknown as Incomplete<T>
  }

  startNodeAt<T extends NodeType>(loc: Position): Incomplete<T> {
    return new Node(
      loc.index,
      loc,
      this.options.ranges,
      this.filename
    ) as unknown as Incomplete<T>
  }

  /** Start a new node with a previous node's location. */
  startNodeAtNode<T extends NodeType>(
    type: Incomplete<NodeType>
  ): Incomplete<T> {
    return this.startNodeAt(type.loc.start)
  }

  /** Finish an AST node, adding `type` and `end` properties. */
  finishNode<T extends NodeType>(node: Incomplete<T>, type: T["type"]): T {
    return this.finishNodeAt(
      node,
      type,
      this.state.lastTokEndLoc ?? ZeroPosition
    )
  }

  /** Finish node at given position */
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
    const nodeAsT = node as T
    nodeAsT.type = type
    nodeAsT.end = endLoc.index
    nodeAsT.loc.end = endLoc
    if (this.options.ranges && !!nodeAsT.range) nodeAsT.range[1] = endLoc.index
    if (this.options.attachComment) this.processComment(nodeAsT)
    return nodeAsT
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
