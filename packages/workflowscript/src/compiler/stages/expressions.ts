import type { CompilerPath } from "./base.js"
import { VarsCompiler } from "./vars.js"
import * as T from "../../ast/types.js"
import { matchers as M } from "../../ast/node.js"
import { ILOpcode, il, type ILProgram } from "../il.js"
import { Opcode, Type, Unop, Binop } from "@workflowasm/protocols-js"
import { Errors } from "../error.js"

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
  if (nativeOp != null) return [[ILOpcode.ASM, Opcode.OP_BINOP, nativeOp]]
  // Binops implemented as negations of other binops
  if (op === "!=") {
    return [
      [ILOpcode.ASM, Opcode.OP_BINOP, Binop.EQ],
      [ILOpcode.ASM, Opcode.OP_UNOP, Unop.NOT]
    ]
  } else if (op === ">") {
    return [
      [ILOpcode.ASM, Opcode.OP_BINOP, Binop.LE],
      [ILOpcode.ASM, Opcode.OP_UNOP, Unop.NOT]
    ]
  } else if (op === ">=") {
    return [
      [ILOpcode.ASM, Opcode.OP_BINOP, Binop.LT],
      [ILOpcode.ASM, Opcode.OP_UNOP, Unop.NOT]
    ]
  }
  // Should be unreachable
  throw new Error("INTERNAL COMPILER ERROR: invalid binop in binopImpl")
}

export class ExpressionsCompiler extends VarsCompiler {
  override exit(path: CompilerPath): void {
    super.exit(path)
    const { node } = path
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

  exitUnaryExpression(path: CompilerPath, node: T.UnaryExpression) {
    path.il = il(this.resolveIL(path.get("argument")), [
      ILOpcode.ASM,
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
        [ILOpcode.ASM, Opcode.OP_CALL, 0]
      )
    }
  }
}
