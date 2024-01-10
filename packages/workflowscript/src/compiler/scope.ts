import { TypedPath, Visitor } from "../ast/traverse.js"
import type { Node } from "../ast/types.js"
import type * as T from "../ast/types.js"
import { matchers as M } from "../ast/node.js"
import { makeErrorClass } from "../errors.js"
import { dotPathToString, getBindingIdentifiers } from "../ast/util.js"

const DuplicateBindingError = makeErrorClass(
  (details: { name: string }) => `Duplicate binding: '${details.name}`
)

export enum BindingType {
  VARIABLE = 0,
  MODULE_FUNCTION = 1,
  IMPORTED_FUNCTION = 2
}

export interface Binding {
  name: string
  scope: Scope
  kind: T.VariableDeclarationKind
  type: BindingType
  declarator:
    | T.ImportSpecifier
    | T.VariableDeclarator
    | T.FunctionDeclaration
    | T.Pattern
  declaratorPath: ScopedPath
  importPackage?: string
  importSemver?: string
}

export class Scope {
  /** Parent Scope, if any */
  parent?: Scope
  /** The `Node` that opened this `Scope`. */
  initiator: Node
  /** Path to the `Node` that opened this `Scope`. */
  initiatorPath: ScopedPath
  /** Variable bindings indexed by binding name. */
  bindings: Record<string, Binding | undefined> = {}
  /** Unique scope prefix relative to the nearest function scope */
  prefix: string = ""
  /** Upward-counting index for generating child prefixes */
  childIndex: number = 0
  /** Upward-counting index for generating unique labels */
  labelIndex: number = 0

  constructor(initiator: Node, initiatorPath: ScopedPath) {
    this.initiator = initiator
    this.initiatorPath = initiatorPath
  }

  bindUnique(binding: Omit<Binding, "scope">) {
    // Don't allow double binding
    if (this.bindings[binding.name] !== undefined) {
      binding.declaratorPath.raise(DuplicateBindingError, {
        name: binding.name
      })
    }
    ;(binding as Binding).scope = this
    this.bindings[binding.name] = binding as Binding
  }

  child(initiator: Node, initiatorPath: ScopedPath): Scope {
    const ret = new Scope(initiator, initiatorPath)
    ret.parent = this
    ret.prefix = `${this.prefix}@${this.childIndex}`
    this.childIndex++
    return ret
  }

  resolve(name: string): Binding | undefined {
    const localBinding = this.bindings[name]
    if (localBinding) return localBinding
    else return this.parent?.resolve(name) ?? undefined
  }

  compiledName(binding: Binding): string {
    return this.prefix + binding.name
  }

  dump(indent: number = 0): string {
    return `Bindings: ${Object.keys(this.bindings).join(",")}\nParent:\n${
      this.parent?.dump() ?? ""
    }`
  }

  createLabel(): string {
    return `${this.prefix}@@${this.labelIndex++}`
  }
}

export class TypedScopedPath<PathT> extends TypedPath<PathT> {
  /** The tightest enclosing `Scope` that applies to this path. */
  scope?: Scope

  /**
   * If this path is an `Identifier` referencing a binding, this points
   * to the referenced binding.
   */
  refersTo?: Binding
}

export type ScopedPath = TypedScopedPath<ScopedPath>

export class ScopeVisitor extends Visitor<ScopedPath> {
  override enter(path: ScopedPath): void {
    const { node } = path
    // By default, every node inherits its parent scope if that scope
    // exists.
    if (path.scope === undefined && path.parent) {
      path.scope = path.parent.scope
    }

    if (M.isProgram(node)) {
      // Global scope
      path.scope = new Scope(node, path)
    } else if (M.isImportSpecifier(node)) {
      const impDeclPath = path.parent as ScopedPath
      const impDecl = impDeclPath.node as T.ImportDeclaration
      // An import specifier adds its bindings to the global scope
      path.scope?.bindUnique({
        name: node.as ? node.as.name : node.imported.name,
        kind: "const",
        declarator: node,
        declaratorPath: path,
        type: BindingType.IMPORTED_FUNCTION,
        importPackage: dotPathToString(impDecl.from),
        importSemver: node.semver.value
      })
    } else if (M.isFunctionDeclaration(node)) {
      this.enterFunctionDeclaration(path, node)
    } else if (M.isBlockStatement(node)) {
      // A block statement creates a scope if its parent isn't a function.
      // If it is a function, the function scope is taken as equal to the
      // block scope.
      if (!M.isFunctionDeclaration(path.parent?.node)) {
        path.scope = path.scope?.child(node, path)
      }
    } else if (M.isVariableDeclarator(node)) {
      this.enterVariableDeclarator(path, node)
    }
  }

  enterFunctionDeclaration(path: ScopedPath, node: T.FunctionDeclaration) {
    // A function declaration adds itself to the containing scope...
    path.scope?.bindUnique({
      name: node.name.name,
      kind: "const",
      declarator: node,
      declaratorPath: path,
      type: BindingType.MODULE_FUNCTION
    })
    // ..creates a new child scope...
    const functionScope = new Scope(node, path)
    functionScope.parent = path.scope
    path.scope = functionScope
    // ...and adds its params to that scope
    for (const [index, parameter] of node.parameters.entries()) {
      const parmPath = path.get("parameters", index) as ScopedPath
      for (const bid of getBindingIdentifiers(parameter, parmPath)) {
        path.scope?.bindUnique({
          name: bid[0].name,
          kind: "let",
          declarator: bid[0],
          declaratorPath: bid[1],
          type: BindingType.VARIABLE
        })
      }
    }
  }

  enterVariableDeclarator(path: ScopedPath, node: T.VariableDeclarator) {
    // A variable declarator adds itself to the enclosing scope as a binding.
    // Check enclosing declaration for var type
    let kind: T.VariableDeclarationKind = "const"
    const [declNode] = path.findAncestorOfType<T.VariableDeclaration>(
      "VariableDeclaration"
    )
    if (declNode) {
      kind = declNode.kind
    }
    // Bind to scope
    const idPath = path.get("id") as ScopedPath
    for (const bid of getBindingIdentifiers(node.id, idPath)) {
      path.scope?.bindUnique({
        name: bid[0].name,
        kind,
        declarator: bid[0],
        declaratorPath: bid[1],
        type: BindingType.VARIABLE
      })
    }
  }
}
