import type { CompilerPath } from "./base.js"
import { ExpressionsCompiler } from "./expressions.js"
import { matchers as M } from "../../ast/node.js"
import { ILOpcode, il } from "../il.js"
import { Opcode } from "@workflowasm/protocols-js"
import * as T from "../../ast/types.js"

export class StatementsCompiler extends ExpressionsCompiler {
  override exit(path: CompilerPath): void {
    super.exit(path)
    const { node } = path
    if (M.isExpressionStatement(node)) {
      // Evaluate the expression and drop its result.
      path.il = il(this.resolveIL(path.get("expression")), [
        ILOpcode.ASM,
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

  exitIfStatement(path: CompilerPath, node: T.IfStatement) {
    const exitLabel = path.scope.createLabel()
    const preamble = il(this.resolveIL(path.get("test")), [
      ILOpcode.ASM,
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
