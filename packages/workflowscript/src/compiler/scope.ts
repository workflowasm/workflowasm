import { TypedPath, Visitor } from "../ast/traverse.js"
import type { Node } from "../ast/types.js"

export class Scope {
  /** Parent Scope, if any */
  parent?: Scope
  /** The `Node` that opened this `Scope`. */
  initiator: Node
  /** Path to the `Node` that opened this `Scope`. */
  initiatorPath: ScopedPath

  constructor(initiator: Node, initiatorPath: ScopedPath) {
    this.initiator = initiator
    this.initiatorPath = initiatorPath
  }
}

export class TypedScopedPath<PathT> extends TypedPath<PathT> {
  /** The tightest enclosing `Scope` that applies to this path. */
  scope?: Scope
}

export type ScopedPath = TypedScopedPath<ScopedPath>

export class ScopeVisitor extends Visitor<ScopedPath> {}
