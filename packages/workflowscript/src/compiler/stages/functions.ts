import type { CompilerPath } from "./base.js"
import { RefsCompiler } from "./refs.js"
import { matchers as M } from "../../ast/node.js"
import * as T from "../../ast/types.js"
import { Errors } from "../error.js"
import {
  findAnnotations,
  getStringLiteralAnnotationArgument
} from "../../ast/util.js"
import { FunctionDefinition, ILOpcode, il, type ILProgram } from "../il.js"

const semverValid = require("semver/functions/valid")

// Compiler stage to attach function declarations
export class FunctionsCompiler extends RefsCompiler {
  override enter(path: CompilerPath): void {
    super.enter(path)
    const { node } = path
    // All paths should inherit their parent enclosing function
    if (path.func === undefined) path.func = path.parent?.func
    if (M.isFunctionDeclaration(node)) {
      this.enterFunctionDeclaration(path, node)
    }
  }

  override exit(path: CompilerPath): void {
    super.exit(path)
    const { node } = path
    if (M.isFunctionDeclaration(node)) {
      this.exitFunctionDeclaration(path, node)
    }
  }

  enterFunctionDeclaration(path: CompilerPath, node: T.FunctionDeclaration) {
    // Early sanity checks + creation of FunctionDefinition
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

  exitFunctionDeclaration(path: CompilerPath, node: T.FunctionDeclaration) {
    // Generate IL preamble for entering a function.
    //
    // Basic idea: when function is called, parameters are pushed to the
    // empty stack in order, with the last parameter at the top of the
    // stack.
    //
    // First normalize to the expected number of args. If missing args,
    // push `undefined` for each missing arg. If surplus args, if rest,
    // collect surplus in rest, otherwise pop them from the stack.
    //
    // Then vacuum up all args on the stack into local vars using the
    // assignment patterns provided in the function's definition.
    const hasRest =
      node.parameters.length > 0 &&
      M.isRestElement(node.parameters[node.parameters.length - 1])
    const n = hasRest ? node.parameters.length - 1 : node.parameters.length
    let argil: ILProgram = []

    argil.push([ILOpcode.NORMALIZE_ARGS, { n, rest: hasRest }])

    for (let i = node.parameters.length - 1; i >= 0; i--) {
      argil = argil.concat(
        this.compilePattern(path.get("parameters", i), node.parameters[i])
      )
    }
    const bodyIL = this.resolveIL(path.get("body"))
    path.il = il(argil, bodyIL)
    // Commit the IL of the function to the FunctionDefinition
    if (path.func) path.func.program = path.il
  }
}
