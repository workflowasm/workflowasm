import {
  Expr,
  Value,
  Constant,
  Expr_CreateList,
  ListValue,
  Expr_Ident,
  Expr_Select
} from "@workflowasm/protocols-js"
import { Context } from "./context.js"
import { Any } from "@bufbuild/protobuf"

function evaluateConstant(constant: Constant): Value {
  switch (constant.constantKind.case) {
    case "boolValue":
      return new Value({
        kind: { case: "boolValue", value: constant.constantKind.value }
      })
      break
    case "bytesValue":
      return new Value({
        kind: { case: "bytesValue", value: constant.constantKind.value }
      })
      break
    case "doubleValue":
      return new Value({
        kind: { case: "doubleValue", value: constant.constantKind.value }
      })
      break
    case "int64Value":
      return new Value({
        kind: { case: "int64Value", value: constant.constantKind.value }
      })
      break
    case "uint64Value":
      return new Value({
        kind: { case: "uint64Value", value: constant.constantKind.value }
      })
      break
    case "nullValue":
      return new Value({
        kind: { case: "nullValue", value: 0 }
      })
      break
    case "stringValue":
      return new Value({
        kind: { case: "stringValue", value: constant.constantKind.value }
      })
      break
    case "timestampValue":
      throw new Error("deprecated Timestamp constant")
      break
    case "durationValue":
      throw new Error("deprecated Duration constant")
      break
    case undefined:
      throw new Error("unknown Constant type")
      break
  }
}

function evaluateList(expr: Expr_CreateList, context: Context): Value {
  // TODO: handle optional elements?
  const evaluatedList = expr.elements.map((element) =>
    evaluate(element, context)
  )
  return new Value({
    kind: {
      case: "listValue",
      value: new ListValue({ values: evaluatedList })
    }
  })
}

function evaluateIdentifier(expr: Expr_Ident, context: Context): Value {
  const id_val = context.evaluateIdentifier(expr.name)
  if (id_val === undefined) {
    throw new Error(`Undefined identifier: ${expr.name}`)
  }
  return id_val
}

function evaluateSelect(expr: Expr_Select, context: Context): Value {
  if (expr.operand === undefined) {
    throw new Error(`Selection with undefined left hand side`)
  }
  const lhs_val = evaluate(expr.operand, context)
  // Select only works on maps and messages
  switch (lhs_val.kind.case) {
    case "objectValue": {
      const anyMessage = lhs_val.kind.value
      const unpackedMessage = anyMessage.unpack(context)
      break
    }

    case "mapValue":
      break

    default:
      break
  }
}

export function evaluate(expr: Expr, context: Context): Value {
  switch (expr.exprKind.case) {
    case "constExpr":
      return evaluateConstant(expr.exprKind.value)
      break

    case "identExpr":
      return evaluateIdentifier(expr.exprKind.value, context)
      break

    case "listExpr":
      return evaluateList(expr.exprKind.value, context)
      break

    case "selectExpr":
      return evaluateSelect(expr.exprKind.value, context)
      break

    case "structExpr":
      break

    case "callExpr":
      break

    case "comprehensionExpr":
      break

    case undefined:
      break
  }
}
