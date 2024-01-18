import type { CompilerPath } from "./base.js"
import { FunctionsCompiler } from "./functions.js"
import * as T from "../../ast/types.js"
import { matchers as M } from "../../ast/node.js"
import { ILOpcode, il } from "../il.js"
import { Opcode, Type } from "@workflowasm/protocols-js"
import { Errors } from "../error.js"

export class VarsCompiler extends FunctionsCompiler {
  override exit(path: CompilerPath): void {
    super.exit(path)
    const { node } = path
    if (M.isVariableDeclaration(node)) {
      this.exitVariableDeclaration(path, node)
    } else if (M.isVariableDeclarator(node)) {
      this.exitVariableDeclarator(path, node)
    } else if (M.isAssignmentExpression(node)) {
      this.exitAssignmentExpression(path, node)
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
          ? [ILOpcode.ASM, Opcode.OP_PUSHNULL, 0]
          : this.resolveIL(path.get("init")),
        [ILOpcode.PUSHLITERAL, [Type.STRING, lval.name], null],
        [ILOpcode.ASM, Opcode.OP_SETVAR, 0]
      )
    } else {
      // TODO: implement
      path.raise(Errors.CompilationError, {
        message: "Destructuring patterns NYI"
      })
    }
  }

  exitAssignmentExpression(path: CompilerPath, node: T.AssignmentExpression) {
    if (M.isPattern(node.left)) {
      path.il = il(
        this.resolveIL(path.get("right")),
        [ILOpcode.ASM, Opcode.OP_DUP, 0],
        this.compilePattern(path.get("left"), node.left)
      )
    } else {
      // XXX: fix this, no exprs on LHS of assignments in wfs
      throw new Error("XXX: internal error")
    }
  }
}
