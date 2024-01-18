import { il, ILOpcode, type ILProgram } from "../il.js"
import { BaseCompiler, type CompilerPath } from "./base.js"
import * as T from "../../ast/types.js"
import { matchers as M } from "../../ast/node.js"
import { Errors } from "../error.js"
import { BindingType } from "../scope.js"
import { Opcode, Type } from "@workflowasm/protocols-js"

export class RefsCompiler extends BaseCompiler {
  /**
   * Resolve an expression into IL. Most of the work
   * is done by other stages of the compiler, but in particular we must
   * deal with `Identifier`s which are reference to variables.
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
      if (binding.type === BindingType.VARIABLE) {
        return il([
          // push var name
          [ILOpcode.PUSHLITERAL, [Type.STRING, binding.compiledName], null],
          // GETVAR
          [ILOpcode.ASM, Opcode.OP_GETVAR, 0]
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
      } else {
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
      }
    } else {
      // Non-identifier node, shouldn't happen
      throw path.raise(Errors.CompilationError, {
        message: `INTERNAL COMPILER ERROR: reached a node whose IL could not be compiled. type: ${node.type}`
      })
    }
  }

  /**
   * Compile a destructuring pattern down to primitive assignments.
   * The resulting IL assumes that the RHS of the destructuring pattern
   * is already at the top of the stack.
   */
  compilePattern(path: CompilerPath | undefined, node: T.Pattern): ILProgram {
    if (path === undefined) {
      throw new Error("INTERNAL COMPILER ERROR, compilePattern got null path")
    }
    if (M.isIdentifier(node)) {
      const binding = path.scope.resolve(node.name)
      if (binding === undefined) {
        throw path.raise(Errors.UnresolvedIdentifier, { name: node.name })
      }
      return il(
        [ILOpcode.PUSHLITERAL, [Type.STRING, binding.compiledName], null],
        [ILOpcode.ASM, Opcode.OP_SETVAR, 0]
      )
    } else {
      throw new Error("unimplemented")
    }
  }
}
