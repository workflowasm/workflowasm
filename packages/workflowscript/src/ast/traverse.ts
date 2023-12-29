import { type Node } from "./types.js"
import { type NodeMetadata, getMetadata } from "./node.js"

export class Scope {
  parent?: Scope
}

export type VisitNode = Node & {
  metadata: NodeMetadata
  path: Path
  parent?: VisitNode
  scope?: Scope
  [key: string]: unknown
}

type PathEntry = [key: string, index: number | null]

export class Path {
  visitor: Visitor
  node: VisitNode
  parentPath?: Path
  entries: PathEntry[]

  constructor(visitor: Visitor, node: VisitNode, entries: PathEntry[]) {
    this.visitor = visitor
    this.node = node
    this.entries = entries
  }

  static root(visitor: Visitor, node: VisitNode): Path {
    return new Path(visitor, node, [])
  }

  child(child: VisitNode, key: string, index?: number): Path {
    const result = new Path(
      this.visitor,
      child,
      this.entries.concat([[key, index ?? null]])
    )
    result.parentPath = this
    return result
  }
}

export class Visitor {
  /**
   * Queue of nodes to be visited
   */
  queue: VisitNode[] = []

  visit(node: Node, path?: Path) {
    const visitNode = node as VisitNode

    // If we haven't visited the node before, attach helpful data.
    // Lint rule disabled because this is a logically sound use case.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (visitNode.metadata === undefined) {
      visitNode.metadata = getMetadata(node.type)
      if (path !== undefined) {
        visitNode.path = path
        visitNode.parent = path.parentPath?.node
        visitNode.scope = path.parentPath?.node.scope
      } else {
        visitNode.path = Path.root(this, visitNode)
      }
    }

    // Enter the node
    this.enter(visitNode.path)
    const wasReplaced = visitNode.path.node !== visitNode

    // If the node wasn't replaced, visit its children in order
    if (!wasReplaced) {
      for (const childKey of visitNode.metadata.traverse ?? []) {
        const childNode = visitNode[childKey] as
          | Node
          | undefined
          | (Node | null | undefined)[]
        if (Array.isArray(childNode)) {
          for (const [index, node] of childNode.entries()) {
            if (node != null) {
              this.visit(
                node,
                visitNode.path.child(node as VisitNode, childKey, index)
              )
            }
          }
        } else if (childNode !== undefined) {
          this.visit(
            childNode,
            visitNode.path.child(childNode as VisitNode, childKey)
          )
        }
      }
    }

    // Exit the node
    this.exit(visitNode.path)
  }

  enter(_path: Path) {}

  exit(_path: Path) {}
}
