import { Visitor, createRootPath } from "../ast/traverse.js"
import * as T from "../ast/types.js"
import {
  ObjectFile,
  Type,
  Opcode,
  Unop,
  Binop,
  dumpAsm
} from "@workflowasm/protocols-js"
import { matchers as M } from "../ast/node.js"
import { type SourceCode } from "../types.js"
import { Errors } from "./error.js"
import {
  findAnnotations,
  getStringLiteralAnnotationArgument
} from "../ast/util.js"
import {
  BindingType,
  ScopeVisitor,
  TypedScopedPath,
  type Scope
} from "./scope.js"
import { ReferenceVisitor } from "./reference.js"
import {
  FunctionDefinition,
  ILOpcode,
  il,
  type ILProgram,
  dumpIL
} from "./il.js"

const semverValid = require("semver/functions/valid")

const binopMap: { [t in T.BinaryOperator]: Binop | null } = {
  "+": Binop.ADD,
  "-": Binop.SUB,
  "*": Binop.MUL,
  "/": Binop.DIV,
  "%": Binop.MOD,
  "^": Binop.POW,
  "&&": Binop.AND,
  "||": Binop.OR,
  "==": Binop.EQ,
  "!=": null, // implemented as Unop.NOT Binop.EQ
  "<": Binop.LT,
  "<=": Binop.LE,
  ">": null, // Implemented as Unop.NOT Binop.LE
  ">=": null, // Implemented as Unop.NOT Binop.LT
  "??": Binop.NULLISH_COALESCE
}

function binopImpl(op: T.BinaryOperator): ILProgram {
  // Native wfasm binops
  const nativeOp = binopMap[op]
  if (nativeOp != null) return [[ILOpcode.WFASM, Opcode.OP_BINOP, nativeOp]]
  // Binops implemented as negations of other binops
  if (op === "!=") {
    return [
      [ILOpcode.WFASM, Opcode.OP_BINOP, Binop.EQ],
      [ILOpcode.WFASM, Opcode.OP_UNOP, Unop.NOT]
    ]
  } else if (op === ">") {
    return [
      [ILOpcode.WFASM, Opcode.OP_BINOP, Binop.LE],
      [ILOpcode.WFASM, Opcode.OP_UNOP, Unop.NOT]
    ]
  } else if (op === ">=") {
    return [
      [ILOpcode.WFASM, Opcode.OP_BINOP, Binop.LT],
      [ILOpcode.WFASM, Opcode.OP_UNOP, Unop.NOT]
    ]
  }
  // Should be unreachable
  throw new Error("INTERNAL COMPILER ERROR: invalid binop in binopImpl")
}

class TypedCompilerPath<PathT> extends TypedScopedPath<PathT> {
  func?: FunctionDefinition
  il?: ILProgram
  // Scope for all paths is set by the ScopeVisitor
  declare scope: Scope
}
type CompilerPath = TypedCompilerPath<CompilerPath>

export class Compiler extends Visitor<CompilerPath> {
  /** The parsed input program */
  program: T.Program

  /** The source code (used for error framing) */
  source?: SourceCode

  /** The package definition */
  package?: string

  /** Collected function definitions */
  // eslint-disable-next-line @typescript-eslint/ban-types
  functions: { [name: string]: FunctionDefinition } = {}

  constructor(program: T.Program, source?: SourceCode) {
    super()
    this.program = program
    this.source = source
  }

  compile(): ObjectFile {
    const rootPath = createRootPath(
      TypedCompilerPath<CompilerPath>,
      this.program,
      this.source
    )
    // Perform initial scoping pass
    const scoper = new ScopeVisitor()
    scoper.visit(rootPath)
    // Perform referencing pass
    const reffer = new ReferenceVisitor()
    reffer.visit(rootPath)
    // Perform IL generation pass
    this.visit(rootPath)
    // Perform ASM generation pass
    for (const func of Object.values(this.functions)) {
      func.compile()
    }
    return new ObjectFile({})
  }

  dumpIL(): string {
    let res = ""
    for (const [name, def] of Object.entries(this.functions)) {
      const prog = def.program
      res += `${name} v'${def.semver}':\n` + (prog ? dumpIL(prog, "  ") : "")
    }
    return res
  }

  dumpAsm(): string {
    return Object.values(this.functions)
      .map((fn) => {
        return `${fn.name} v'${fn.semver}'\n${dumpAsm(
          fn.asm ?? [],
          fn.ktable ?? [],
          "  "
        )}`
      })
      .join("\n\n\n")
  }

  /////////////////////// ENTRY VISITORS
  override enter(path: CompilerPath): void {
    const { node } = path
    // Inherit function scope
    if (path.func === undefined) path.func = path.parent?.func
    if (M.isFunctionDeclaration(node)) {
      this.enterFunctionDeclaration(path, node)
    }
  }

  enterFunctionDeclaration(path: CompilerPath, node: T.FunctionDeclaration) {
    if (M.isProgram(path.parent?.node)) {
      // Root-level function declaration
      const [versions, paths] = findAnnotations(node, path, "version")
      if (versions.length !== 1) {
        throw path.raise(Errors.CompilationError, {
          message:
            "Top-level function declarations must have a `@version(semver)` annotation."
        })
      }
      const annotationPath = paths[0]
      const version = getStringLiteralAnnotationArgument(versions[0])
      if (version === undefined) {
        throw annotationPath.raise(Errors.CompilationError, {
          message: `\`@version\` must be supplied with a single string literal argument representing the semver of the function.`
        })
      }
      if (!semverValid(version)) {
        throw annotationPath.raise(Errors.CompilationError, {
          message: `'${version}' is not a valid semver specifier.`
        })
      }
      const fdef = new FunctionDefinition(node.name.name, version)
      path.func = fdef
      this.functions[node.name.name] = fdef
    } else {
      // Sub-level function declaration
      // TODO: impl
      throw path.raise(Errors.CompilationError, {
        message: "Sub-level function declarations are not yet supported."
      })
    }
  }

  ///////////////////////// EXIT VISITORS
  override exit(path: CompilerPath): void {
    const { node } = path
    //// EXPRESSIONS
    if (M.isLiteral(node)) {
      this.exitLiteral(path, node)
    } else if (M.isUnaryExpression(node)) {
      this.exitUnaryExpression(path, node)
    } else if (M.isBinaryExpression(node)) {
      this.exitBinaryExpression(path, node)
    } else if (M.isCallExpression(node)) {
      this.exitCallExpression(path, node)
    } else if (M.isMemberExpression(node)) {
    } else if (M.isArrayExpression(node)) {
    } else if (M.isObjectExpression(node)) {
    } else if (M.isAssignmentExpression(node)) {
      this.exitAssignmentExpression(path, node)
    } else if (M.isFunctionExpression(node)) {
    } else if (M.isSequenceExpression(node)) {
    } else if (M.isConditionalExpression(node)) {
    } else if (M.isTaggedTemplateExpression(node)) {
    }
    ////// STATEMENTS
    else if (M.isVariableDeclaration(node)) {
      this.exitVariableDeclaration(path, node)
    } else if (M.isVariableDeclarator(node)) {
      this.exitVariableDeclarator(path, node)
    } else if (M.isFunctionDeclaration(node)) {
      this.exitFunctionDeclaration(path, node)
    } else if (M.isExpressionStatement(node)) {
      // Evaluate the expression and drop its result.
      path.il = il(this.resolveIL(path.get("expression")), [
        ILOpcode.WFASM,
        Opcode.OP_POP,
        1
      ])
    } else if (M.isBlockStatement(node)) {
      const isFn = M.isFunctionDeclaration(path.parent?.node)
      path.il = il(
        !isFn ? [ILOpcode.OPEN_SCOPE, path.scope.prefix, null] : [],
        ...path.map("body", (elt) => {
          return elt.il ?? []
        }),
        !isFn ? [ILOpcode.CLOSE_SCOPE, path.scope.prefix, null] : []
      )
    } else if (M.isReturnStatement(node)) {
    } else if (M.isThrowStatement(node)) {
      // XXX: eliminate this
    } else if (M.isBreakStatement(node)) {
    } else if (M.isContinueStatement(node)) {
    } else if (M.isWhileStatement(node)) {
    } else if (M.isForInStatement(node)) {
    } else if (M.isIfStatement(node)) {
      this.exitIfStatement(path, node)
    }
  }

  exitLiteral(path: CompilerPath, node: T.Node) {
    if (M.isBooleanLiteral(node)) {
      path.il = [[ILOpcode.PUSHLITERAL, [Type.BOOL, node.value], null]]
    } else if (M.isIntLiteral(node)) {
      path.il = [[ILOpcode.PUSHLITERAL, [Type.INT64, node.value], null]]
    } else if (M.isFloatLiteral(node)) {
      path.il = [[ILOpcode.PUSHLITERAL, [Type.DOUBLE, node.value], null]]
    } else if (M.isStringLiteral(node)) {
      path.il = [[ILOpcode.PUSHLITERAL, [Type.STRING, node.value], null]]
    } else if (M.isTemplateLiteral(node)) {
      // TODO: impl
      throw path.raise(Errors.CompilationError, {
        message: "Template support NYI"
      })
    }
  }

  /**
   * Resolve an expression into IL. Most of the work
   * is done by other stages of the compiler, but in particular we must
   * deal with `Identifier`s here.
   */
  resolveIL(path: CompilerPath | undefined): ILProgram {
    if (path === undefined)
      throw new Error(
        "INTERNAL COMPILER ERROR: resolveAsm received nullish path."
      )
    // Compiled expressions should already be resolved into asm
    if (path.il) return path.il
    // What's left should be an `Identifier`, which should have been
    // referenced by the referencing pass
    const { node } = path
    if (M.isIdentifier(node)) {
      const binding = path.refersTo
      if (binding == null) {
        throw path.raise(Errors.UnresolvedIdentifier, { name: node.name })
      }
      const scope = binding.scope
      if (binding.type === BindingType.VARIABLE) {
        const compiledName = scope.compiledName(binding)
        return il([
          // push var name
          [ILOpcode.PUSHLITERAL, [Type.STRING, compiledName], null],
          // GETVAR
          [ILOpcode.WFASM, Opcode.OP_GETVAR, 0]
        ])
      } else if (binding.type === BindingType.MODULE_FUNCTION) {
        // Function from this compilation unit
        return il([
          [
            ILOpcode.PUSHFN,
            { package: "", name: binding.name, semver: "" },
            null
          ]
        ])
      } else if (binding.type === BindingType.IMPORTED_FUNCTION) {
        // Function from imported package
        return il([
          [
            ILOpcode.PUSHFN,
            {
              package: binding.importPackage ?? "(unknown package)",
              name: binding.name,
              semver: binding.importSemver ?? "(invalid semver)"
            },
            null
          ]
        ])
      } else {
        throw new Error("INTERNAL COMPILER ERROR: invalid binding type")
      }
    } else {
      // Non-identifier node, shouldn't happen
      throw path.raise(Errors.CompilationError, {
        message: `INTERNAL COMPILER ERROR: reached a node whose IL could not be compiled. type: ${node.type}`
      })
    }
  }

  exitUnaryExpression(path: CompilerPath, node: T.UnaryExpression) {
    path.il = il(this.resolveIL(path.get("argument")), [
      ILOpcode.WFASM,
      Opcode.OP_UNOP,
      node.operator === "!" ? Unop.NOT : Unop.MINUS
    ])
  }

  exitBinaryExpression(path: CompilerPath, node: T.BinaryExpression) {
    path.il = il(
      this.resolveIL(path.get("left")),
      this.resolveIL(path.get("right")),
      binopImpl(node.operator)
    )
  }

  exitCallExpression(path: CompilerPath, node: T.CallExpression) {
    // TODO: modify parser and this to support `try` correctly
    const calleeIL = this.resolveIL(path.get("callee"))
    const argsIL: ILProgram[] = []
    for (const [index] of node.arguments.entries()) {
      argsIL.push(this.resolveIL(path.get("arguments", index)))
    }
    if (node.optional) {
      // TODO: impl
      // if callee is callable, call, otherwise resolve to `null`
      throw path.raise(Errors.CompilationError, {
        message: "Optional call expressions NYI"
      })
    } else {
      path.il = il(
        // args
        ...argsIL,
        // arg count
        // XXX: Fix for SpreadElement later
        [ILOpcode.PUSHLITERAL, [Type.INT64, BigInt(argsIL.length)], null],
        // callee
        calleeIL,
        // CALL
        [ILOpcode.WFASM, Opcode.OP_CALL, 0]
      )
    }
  }

  exitAssignmentExpression(path: CompilerPath, node: T.AssignmentExpression) {
    const lhs = node.left
    // TODO: destructuring patterns
    if (M.isIdentifier(lhs)) {
      path.il = il(
        this.resolveIL(path.get("right")),
        [ILOpcode.WFASM, Opcode.OP_DUP, 0],
        [ILOpcode.PUSHLITERAL, [Type.STRING, lhs.name], null],
        [ILOpcode.WFASM, Opcode.OP_SETVAR, 0]
      )
    } else {
      path.raise(Errors.CompilationError, {
        message: "Support for LHS patterns other than `Identifier` is NYI."
      })
    }
  }

  exitVariableDeclaration(path: CompilerPath, node: T.VariableDeclaration) {
    path.il = il(...path.map("declarations", (xpath) => xpath.il ?? []))
  }

  exitVariableDeclarator(path: CompilerPath, node: T.VariableDeclarator) {
    const lval = node.id
    if (M.isIdentifier(lval)) {
      path.il = il(
        node.init === undefined
          ? [ILOpcode.WFASM, Opcode.OP_PUSHNULL, 0]
          : this.resolveIL(path.get("init")),
        [ILOpcode.PUSHLITERAL, [Type.STRING, lval.name], null],
        [ILOpcode.WFASM, Opcode.OP_SETVAR, 0]
      )
    } else {
      // TODO: implement
      path.raise(Errors.CompilationError, {
        message: "Destructuring patterns NYI"
      })
    }
  }

  exitFunctionDeclaration(path: CompilerPath, node: T.FunctionDeclaration) {
    // IL for function = set locals to the arguments, then run
    // Peel args off last to first
    const argil: ILProgram = []
    for (let i = node.parameters.length - 1; i >= 0; i--) {
      const param = node.parameters[i]
      if (M.isIdentifier(param)) {
        argil.push(
          [ILOpcode.PUSHLITERAL, [Type.STRING, param.name], null],
          [ILOpcode.WFASM, Opcode.OP_SETVAR, 0]
        )
      } else {
        throw path.get("parameters", i)?.raise(Errors.CompilationError, {
          message: "destructuring patterns NYI"
        })
      }
    }
    const bodyIL = this.resolveIL(path.get("body"))
    path.il = il(argil, bodyIL)
    // Commit the IL of the function to the FunctionDefinition
    if (path.func) path.func.program = path.il
  }

  exitIfStatement(path: CompilerPath, node: T.IfStatement) {
    const exitLabel = path.scope.createLabel()
    const preamble = il(this.resolveIL(path.get("test")), [
      ILOpcode.WFASM,
      Opcode.OP_TEST,
      1
    ])
    if (node.alternate) {
      const alternateLabel = path.scope.createLabel()
      path.il = il(
        preamble,
        [ILOpcode.GOTO, alternateLabel, null],
        this.resolveIL(path.get("consequent")),
        [ILOpcode.GOTO, exitLabel, null],
        [ILOpcode.LABEL, alternateLabel, null],
        this.resolveIL(path.get("alternate")),
        [ILOpcode.LABEL, exitLabel, null]
      )
    } else {
      path.il = il(
        preamble,
        [ILOpcode.GOTO, exitLabel, null],
        this.resolveIL(path.get("consequent")),
        [ILOpcode.LABEL, exitLabel, null]
      )
    }
  }
}
