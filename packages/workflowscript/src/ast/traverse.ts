import { type Node } from "./types.js"
import { type NodeMetadata, getMetadata } from "./node.js"
import { type Constructor, type SourceCode } from "../types.js"
import { WfsError, type WfsErrorConstructor } from "../errors.js"
import { ZeroPosition } from "../parser/position.js"

export class Scope {
  parent?: Scope
}

type PathEntry = [key: string, index: number | null]
type GenericObject = { [key: string]: unknown }

/**
 * `Path`s are the unit of traversal in the AST visitor pattern.
 * During all visits from a given fixed root path (created by `Path.root`)
 * each `Node` will have a unique `Path` assigned to it.
 */
export class TypedPath<PathT> {
  /** The AST `Node` at which this path points */
  node: Node
  /** The metadata of the `Node` at which this path points */
  metadata: NodeMetadata
  /** For non root nodes, a pointer to the parent node's `Path`. */
  parent?: PathT
  /**
   * Pointer to source code information, used to aid in generating
   * friendly error messages.
   */
  source?: SourceCode
  /**
   * For non root nodes, the key which was traversed from the
   * parent node to reach this child.
   */
  parentKey?: string
  /**
   * For non root nodes, the numerical index within the parent key
   * (for compound keys like block bodies) to reach this child.
   */
  parentIndex?: number
  /** Path from the root of the AST to this node */
  entries: PathEntry[]
  /** Cache of children already traversed. */
  traversal?: Record<string, PathT | PathT[] | undefined>;

  declare ["constructor"]: Constructor<PathT>
  constructor(
    node: Node,
    entries: PathEntry[],
    parent?: PathT,
    source?: SourceCode
  ) {
    this.node = node
    this.metadata = getMetadata(node.type)
    this.entries = entries
    this.parent = parent
    this.source = source
  }

  /** Start a new root path beginning at the given AST node. */
  static root<PathT>(
    this: Constructor<PathT>,
    node: Node,
    source?: SourceCode
  ): PathT {
    return new this(node, [], undefined, source)
  }

  /** Get the path of a particular child of this node. */
  get(key: string, index?: number): PathT | undefined {
    // Return cached path if we have it
    const cached = this.traversal?.[key]
    if (cached !== undefined) {
      if (!Array.isArray(cached)) return cached
      if (index !== undefined && index < cached.length) return cached[index]
    }

    // Determine if the path is available
    let child: unknown = (this.node as unknown as GenericObject)[key]
    let wasArray = false
    if (child === undefined) return undefined
    if (Array.isArray(child)) {
      if (index === undefined || index >= child.length) return undefined
      wasArray = true
      child = child[index]
    }
    // @ts-expect-error Ghetto way to check if this is a node
    if (typeof child?.type !== "string") return undefined

    // Cache the result
    const nextPath = new this.constructor(
      child as Node,
      this.entries.concat([[key, wasArray ? index ?? null : null]]),
      this,
      this.source
    )
    if (this.traversal === undefined) this.traversal = {}
    if (this.traversal[key] === undefined) {
      if (wasArray) this.traversal[key] = []
      else this.traversal[key] = nextPath
    }
    // These casts are safe if wasArray is true
    if (wasArray) (this.traversal[key] as PathT[])[index as number] = nextPath

    return nextPath
  }

  /** Raise a `SyntaxError` pointing at the node given by this Path. */
  raise<ErrorT extends WfsError<DetailsT>, DetailsT>(
    errorClass: WfsErrorConstructor<ErrorT, DetailsT>,
    args: DetailsT
  ) {
    const loc = this.node.loc?.start ?? ZeroPosition
    return new errorClass({ loc, details: args, source: this.source })
  }
}

export type Path = TypedPath<Path>

/**
 * Implementation of the Visitor pattern for AST nodes. Given a root
 * `Path`, traverse all children recursively, applying the `enter`
 * and `exit` visitors to each child.
 */
export class Visitor<PathT extends Path> {
  /**
   * Queue of nodes to be visited
   */
  queue: PathT[] = []

  visit(path: PathT) {
    const { node: originalNode } = path
    // Enter the node
    this.enter(path)

    // TODO: if a node *or any parent* is replaced, don't traverse or
    // exit.
    const wasReplaced = path.node !== originalNode

    // If the node wasn't replaced, visit its children in order
    if (!wasReplaced) {
      for (const childKey of path.metadata.traverse ?? []) {
        // lol
        const childNode = (path.node as unknown as GenericObject)[childKey] as
          | Node
          | undefined
          | Array<Node | null | undefined>
        if (Array.isArray(childNode)) {
          for (const [index, node] of childNode.entries()) {
            if (node != null) {
              const nextPath = path.get(childKey, index)
              if (nextPath) this.visit(nextPath as PathT)
            }
          }
        } else if (childNode !== undefined) {
          const nextPath = path.get(childKey)
          if (nextPath) this.visit(nextPath as PathT)
        }
      }
    }

    // Exit the node
    this.exit(path)
  }

  /**
   * Invoked when the Visitor is entering a node.
   */
  enter(_path: PathT) {}

  /**
   * Invoked when the Visitor is exiting a node. Not
   * invoked if the node is replaced in `enter`.
   */
  exit(_path: PathT) {}
}
