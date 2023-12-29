import type { Position } from "../position.js"
import type * as N from "../../ast/types.js"
import { Tokenizer } from "./tokenizer.js"
import { Errors } from "../error.js"

// Each scope gets a bitset that may contain these flags
/* prettier-ignore */
export enum ScopeFlag {
  OTHER        = 0b000000000,
  PROGRAM      = 0b000000001,
  FUNCTION     = 0b000000010,
  ARROW        = 0b000000100,
  SIMPLE_CATCH = 0b000001000,
  SUPER        = 0b000010000,
  DIRECT_SUPER = 0b000100000,
  CLASS        = 0b001000000,
  STATIC_BLOCK = 0b010000000,
  TS_MODULE    = 0b100000000,
  VAR          = PROGRAM | FUNCTION | STATIC_BLOCK | TS_MODULE,
}

/* prettier-ignore */
export enum BindingFlag {
  // These flags are meant to be _only_ used inside the Scope class (or subclasses).
  KIND_VALUE             = 0b0000000_0000_01,
  KIND_TYPE              = 0b0000000_0000_10,
  // Used in checkLVal and declareName to determine the type of a binding
  SCOPE_VAR              = 0b0000000_0001_00, // Var-style binding
  SCOPE_LEXICAL          = 0b0000000_0010_00, // Let- or const-style binding
  SCOPE_FUNCTION         = 0b0000000_0100_00, // Function declaration
  SCOPE_OUTSIDE          = 0b0000000_1000_00, // Special case for function names as
  // bound inside the function
  // Misc flags
  FLAG_NONE              = 0b00000001_0000_00,
  FLAG_CLASS             = 0b00000010_0000_00,
  FLAG_TS_ENUM           = 0b00000100_0000_00,
  FLAG_TS_CONST_ENUM     = 0b00001000_0000_00,
  FLAG_TS_EXPORT_ONLY    = 0b00010000_0000_00,
  FLAG_FLOW_DECLARE_FN   = 0b00100000_0000_00,
  FLAG_TS_IMPORT         = 0b01000000_0000_00,
  // Whether "let" should be allowed in bound names in sloppy mode
  FLAG_NO_LET_IN_LEXICAL = 0b10000000_0000_00,

  // These flags are meant to be _only_ used by Scope consumers
/* prettier-ignore */
  /*                   = is value?  | is type?  |      scope     |    misc flags    */
  TYPE_CLASS           = KIND_VALUE | KIND_TYPE | SCOPE_LEXICAL  | FLAG_CLASS|FLAG_NO_LET_IN_LEXICAL,
  TYPE_LEXICAL         = KIND_VALUE | 0         | SCOPE_LEXICAL  | FLAG_NO_LET_IN_LEXICAL,
  TYPE_CATCH_PARAM     = KIND_VALUE | 0         | SCOPE_LEXICAL  | 0,
  TYPE_VAR             = KIND_VALUE | 0         | SCOPE_VAR      | 0,
  TYPE_FUNCTION        = KIND_VALUE | 0         | SCOPE_FUNCTION | 0,
  TYPE_TS_INTERFACE    = 0          | KIND_TYPE | 0              | FLAG_CLASS,
  TYPE_TS_TYPE         = 0          | KIND_TYPE | 0              | 0,
  TYPE_TS_ENUM         = KIND_VALUE | KIND_TYPE | SCOPE_LEXICAL  | FLAG_TS_ENUM|FLAG_NO_LET_IN_LEXICAL,
  TYPE_TS_AMBIENT      = 0          | 0         | 0              | FLAG_TS_EXPORT_ONLY,
  // These bindings don't introduce anything in the scope. They are used for assignments and
  // function expressions IDs.
  TYPE_NONE            = 0          | 0         | 0              | FLAG_NONE,
  TYPE_OUTSIDE         = KIND_VALUE | 0         | 0              | FLAG_NONE,
  TYPE_TS_CONST_ENUM   = TYPE_TS_ENUM | FLAG_TS_CONST_ENUM,
  TYPE_TS_NAMESPACE    = 0          | 0         | 0              | FLAG_TS_EXPORT_ONLY,
  TYPE_TS_TYPE_IMPORT  = 0          | KIND_TYPE | 0              | FLAG_TS_IMPORT,
  TYPE_TS_VALUE_IMPORT = 0          | 0         | 0              | FLAG_TS_IMPORT,
  TYPE_FLOW_DECLARE_FN = 0          | 0         | 0              | FLAG_FLOW_DECLARE_FN,
}

/* prettier-ignore */
export enum ClassElementType {
  OTHER           = 0,
  FLAG_STATIC     = 0b1_00,
  KIND_GETTER     = 0b0_10,
  KIND_SETTER     = 0b0_01,
  KIND_ACCESSOR   = KIND_GETTER | KIND_SETTER,

  STATIC_GETTER   = FLAG_STATIC | KIND_GETTER,
  STATIC_SETTER   = FLAG_STATIC | KIND_SETTER,
  INSTANCE_GETTER = KIND_GETTER,
  INSTANCE_SETTER = KIND_SETTER,
}

// Start an AST node, attaching a start offset.
export class Scope {
  declare flags: ScopeFlag
  // A set of var-declared names in the current lexical scope
  var: Set<string> = new Set()
  // A set of lexically-declared names in the current lexical scope
  lexical: Set<string> = new Set()
  // A set of lexically-declared FunctionDeclaration names in the current lexical scope
  functions: Set<string> = new Set()

  constructor(flags: ScopeFlag) {
    this.flags = flags
  }
}

// The functions in this module keep track of declared variables in the
// current scope in order to detect duplicate variable names.
export class ScopeHandler<IScope extends Scope = Scope> {
  parser: Tokenizer
  scopeStack: Array<IScope> = []
  inModule: boolean = true
  undefinedExports: Map<string, Position> = new Map()

  constructor(parser: Tokenizer) {
    this.parser = parser
  }

  get inTopLevel() {
    return (this.currentScope().flags & ScopeFlag.PROGRAM) > 0
  }
  get inFunction() {
    return (this.currentVarScopeFlags() & ScopeFlag.FUNCTION) > 0
  }
  get allowSuper() {
    return (this.currentThisScopeFlags() & ScopeFlag.SUPER) > 0
  }
  get allowDirectSuper() {
    return (this.currentThisScopeFlags() & ScopeFlag.DIRECT_SUPER) > 0
  }
  get inClass() {
    return (this.currentThisScopeFlags() & ScopeFlag.CLASS) > 0
  }
  get inClassAndNotInNonArrowFunction() {
    const flags = this.currentThisScopeFlags()
    return (flags & ScopeFlag.CLASS) > 0 && (flags & ScopeFlag.FUNCTION) === 0
  }
  get inStaticBlock() {
    for (let i = this.scopeStack.length - 1; ; i--) {
      const { flags } = this.scopeStack[i]
      if (flags & ScopeFlag.STATIC_BLOCK) {
        return true
      }
      if (flags & (ScopeFlag.VAR | ScopeFlag.CLASS)) {
        // function body, module body, class property initializers
        return false
      }
    }
  }
  get inNonArrowFunction() {
    return (this.currentThisScopeFlags() & ScopeFlag.FUNCTION) > 0
  }
  get treatFunctionsAsVar() {
    return this.treatFunctionsAsVarInScope(this.currentScope())
  }

  createScope(flags: ScopeFlag): Scope {
    return new Scope(flags)
  }

  enter(flags: ScopeFlag) {
    /*:: +createScope: (flags:ScopeFlag) => IScope; */
    // @ts-expect-error This method will be overwritten by subclasses
    this.scopeStack.push(this.createScope(flags))
  }

  exit(): ScopeFlag {
    const scope = this.scopeStack.pop()
    return scope?.flags ?? 0
  }

  // The spec says:
  // > At the top level of a function, or script, function declarations are
  // > treated like var declarations rather than like lexical declarations.
  treatFunctionsAsVarInScope(scope: IScope): boolean {
    return !!(scope.flags & (ScopeFlag.FUNCTION | ScopeFlag.STATIC_BLOCK))
  }

  declareName(name: string, bindingType: BindingFlag, loc: Position) {
    let scope = this.currentScope()
    if (
      bindingType & BindingFlag.SCOPE_LEXICAL ||
      bindingType & BindingFlag.SCOPE_FUNCTION
    ) {
      this.checkRedeclarationInScope(scope, name, bindingType, loc)

      if (bindingType & BindingFlag.SCOPE_FUNCTION) {
        scope.functions.add(name)
      } else {
        scope.lexical.add(name)
      }

      if (bindingType & BindingFlag.SCOPE_LEXICAL) {
        this.maybeExportDefined(scope, name)
      }
    } else if (bindingType & BindingFlag.SCOPE_VAR) {
      for (let i = this.scopeStack.length - 1; i >= 0; --i) {
        scope = this.scopeStack[i]
        this.checkRedeclarationInScope(scope, name, bindingType, loc)
        scope.var.add(name)
        this.maybeExportDefined(scope, name)

        if (scope.flags & ScopeFlag.VAR) break
      }
    }
    if (scope.flags & ScopeFlag.PROGRAM) {
      this.undefinedExports.delete(name)
    }
  }

  maybeExportDefined(scope: IScope, name: string) {
    if (scope.flags & ScopeFlag.PROGRAM) {
      this.undefinedExports.delete(name)
    }
  }

  checkRedeclarationInScope(
    scope: IScope,
    name: string,
    bindingType: BindingFlag,
    loc: Position
  ) {
    if (this.isRedeclaredInScope(scope, name, bindingType)) {
      this.parser.raise(Errors.VarRedeclaration, {
        at: loc,
        identifierName: name
      })
    }
  }

  isRedeclaredInScope(
    scope: IScope,
    name: string,
    bindingType: BindingFlag
  ): boolean {
    if (!(bindingType & BindingFlag.KIND_VALUE)) return false

    if (bindingType & BindingFlag.SCOPE_LEXICAL) {
      return (
        scope.lexical.has(name) ||
        scope.functions.has(name) ||
        scope.var.has(name)
      )
    }

    if (bindingType & BindingFlag.SCOPE_FUNCTION) {
      return (
        scope.lexical.has(name) ||
        (!this.treatFunctionsAsVarInScope(scope) && scope.var.has(name))
      )
    }

    return (
      (scope.lexical.has(name) &&
        // Annex B.3.4
        // https://tc39.es/ecma262/#sec-variablestatements-in-catch-blocks
        !(
          scope.flags & ScopeFlag.SIMPLE_CATCH &&
          scope.lexical.values().next().value === name
        )) ||
      (!this.treatFunctionsAsVarInScope(scope) && scope.functions.has(name))
    )
  }

  checkLocalExport(id: N.Identifier) {
    const { name } = id
    const topLevelScope = this.scopeStack[0]
    if (
      !topLevelScope.lexical.has(name) &&
      !topLevelScope.var.has(name) &&
      // In strict mode, scope.functions will always be empty.
      // Modules are strict by default, but the `scriptMode` option
      // can overwrite this behavior.
      !topLevelScope.functions.has(name)
    ) {
      this.undefinedExports.set(name, id.loc.start)
    }
  }

  currentScope(): IScope {
    return this.scopeStack[this.scopeStack.length - 1]
  }

  currentVarScopeFlags(): ScopeFlag {
    for (let i = this.scopeStack.length - 1; ; i--) {
      const { flags } = this.scopeStack[i]
      if (flags & ScopeFlag.VAR) {
        return flags
      }
    }
  }

  // Could be useful for `arguments`, `this`, `new.target`, `super()`, `super.property`, and `super[property]`.
  currentThisScopeFlags(): ScopeFlag {
    for (let i = this.scopeStack.length - 1; ; i--) {
      const { flags } = this.scopeStack[i]
      if (
        flags & (ScopeFlag.VAR | ScopeFlag.CLASS) &&
        !(flags & ScopeFlag.ARROW)
      ) {
        return flags
      }
    }
  }
}

export class ClassScope {
  // A list of private named declared in the current class
  privateNames: Set<string> = new Set()

  // A list of private getters of setters without their counterpart
  loneAccessors: Map<string, ClassElementType> = new Map()

  // A list of private names used before being defined, mapping to
  // their position.
  undefinedPrivateNames: Map<string, Position> = new Map()
}

export class ClassScopeHandler {
  parser: Tokenizer
  stack: Array<ClassScope> = []
  undefinedPrivateNames: Map<string, Position> = new Map()

  constructor(parser: Tokenizer) {
    this.parser = parser
  }

  current(): ClassScope {
    return this.stack[this.stack.length - 1]
  }

  enter() {
    this.stack.push(new ClassScope())
  }

  exit() {
    this.stack.pop()
  }
}

export class ScopeParser extends Tokenizer {
  scope: ScopeHandler<Scope> = new ScopeHandler<Scope>(this)
}
