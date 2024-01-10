// AST visitor to collect references
import { Visitor } from "../ast/traverse.js"
import { type ScopedPath } from "./scope.js"
import { matchers as M } from "../ast/node.js"
import { Errors } from "./error.js"

/**
 * A visitor that examines `Identifier` nodes, determining if they are
 * references and if so, what binding in what scope they refer to.
 */
export class ReferenceVisitor extends Visitor<ScopedPath> {
  override exit(path: ScopedPath): void {
    const { node } = path
    if (M.isUnaryExpression(node)) {
      this.isMaybeReference(path.get("argument"))
    } else if (M.isBinaryExpression(node)) {
      this.isMaybeReference(path.get("left"))
      this.isMaybeReference(path.get("right"))
    } else if (M.isCallExpression(node)) {
      this.isMaybeReference(path.get("callee"))
      path.map("arguments", (x) => this.isMaybeReference(x))
    } else if (M.isMemberExpression(node)) {
      this.isMaybeReference(path.get("object"))
      if (node.computed) this.isMaybeReference(path.get("property"))
    } else if (M.isArrayExpression(node)) {
      path.map("elements", (x) => this.isMaybeReference(x))
    } else if (M.isObjectExpression(node)) {
      // TODO: implement.
    } else if (M.isAssignmentExpression(node)) {
      // TODO: consider LHS destructuring
      this.isMaybeReference(path.get("left"))
      this.isMaybeReference(path.get("right"))
    } else if (M.isFunctionExpression(node)) {
      // Function expressions can't make references
    } else if (M.isSequenceExpression(node)) {
      path.map("expressions", (x) => this.isMaybeReference(x))
    } else if (M.isConditionalExpression(node)) {
      this.isMaybeReference(path.get("test"))
      this.isMaybeReference(path.get("consequent"))
      this.isMaybeReference(path.get("alternate"))
    } else if (M.isVariableDeclarator(node)) {
      this.isMaybeReference(path.get("init"))
    } else if (M.isReturnStatement(node)) {
      this.isMaybeReference(path.get("argument"))
    } else if (M.isWhileStatement(node)) {
      this.isMaybeReference(path.get("test"))
    } else if (M.isForInStatement(node)) {
      this.isMaybeReference(path.get("iterable"))
    } else if (M.isIfStatement(node)) {
      this.isMaybeReference(path.get("test"))
    }
  }

  /**
   * Determine if the given path is a reference to a bound `Identifier`
   * and if so, associate it with its corresponding binding.
   */
  isMaybeReference(path: ScopedPath | undefined): void {
    if (path === undefined) return
    const { node } = path
    if (M.isIdentifier(node)) {
      const binding = path.scope?.resolve(node.name)
      if (binding == null) {
        throw path.raise(Errors.UnresolvedIdentifier, { name: node.name })
      }
      path.refersTo = binding
    }
  }
}
