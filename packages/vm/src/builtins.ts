// Built-in native functions
import { Binop, Unop } from "@workflowasm/protocols-js"
import { StatusCode } from "./error.js"
import { type NativeFunction, State } from "./state.js"
import { type AnyValue, type NativeResult, Type, toBoolean } from "./value.js"

function s2bi(s: string): bigint | undefined {
  try {
    return BigInt(s)
  } catch (err) {
    return undefined
  }
}

/**
 * Native type cast to int64
 */
export const int64: NativeFunction = {
  nativeFunctionSync(state: State, args: AnyValue[]): NativeResult {
    if (args.length !== 1) {
      return {
        error: state.makeError(
          StatusCode.INVALID_ARGUMENT,
          "int64() requires exactly one argument."
        )
      }
    }

    const val = args[0]

    switch (val[0]) {
      case Type.INT64:
        return { result: val }
      case Type.UINT64:
        return { result: [Type.INT64, BigInt.asIntN(64, val[1])] }
      case Type.DOUBLE:
        return { result: [Type.INT64, BigInt.asIntN(64, BigInt(val[1]))] }
      case Type.STRING: {
        const n = s2bi(val[1])
        if (n === undefined) {
          return {
            error: state.makeError(
              StatusCode.INVALID_ARGUMENT,
              `could not convert \`${val[1]}\` to int64.`
            )
          }
        }
        return { result: [Type.INT64, BigInt.asIntN(64, n)] }
      }
      case Type.ENUM:
        return { result: [Type.INT64, BigInt(val[1][1])] }

      case Type.OBJECT:
      case Type.MAP:
      case Type.LIST:
      case Type.TYPE:
      case Type.CALLABLE:
      case Type.NULL:
      case Type.BOOL:
      case Type.BYTES:
        return {
          error: state.makeError(
            StatusCode.INVALID_ARGUMENT,
            `cannot convert ${Type[val[0]]} to int64`
          )
        }
    }
  }
}

/**
 * Native type cast to uint64
 */
export const uint64: NativeFunction = {
  nativeFunctionSync(state: State, args: AnyValue[]): NativeResult {
    if (args.length !== 1) {
      return {
        error: state.makeError(
          StatusCode.INVALID_ARGUMENT,
          "uint64() requires exactly one argument."
        )
      }
    }

    const val = args[0]

    switch (val[0]) {
      case Type.INT64:
        return { result: [Type.UINT64, BigInt.asUintN(64, val[1])] }
      case Type.UINT64:
        return { result: val }
      case Type.DOUBLE:
        return { result: [Type.UINT64, BigInt.asUintN(64, BigInt(val[1]))] }
      case Type.STRING: {
        const n = s2bi(val[1])
        if (n === undefined) {
          return {
            error: state.makeError(
              StatusCode.INVALID_ARGUMENT,
              `could not convert "${val[1]}" to uint64.`
            )
          }
        }
        return { result: [Type.UINT64, BigInt.asIntN(64, n)] }
      }
      case Type.ENUM:
        return { result: [Type.UINT64, BigInt(val[1][1])] }

      case Type.OBJECT:
      case Type.MAP:
      case Type.LIST:
      case Type.TYPE:
      case Type.CALLABLE:
      case Type.NULL:
      case Type.BOOL:
      case Type.BYTES:
        return {
          error: state.makeError(
            StatusCode.INVALID_ARGUMENT,
            `cannot convert ${Type[val[0]]} to uint64`
          )
        }
    }
  }
}

/**
 * Native type cast to double
 */
export const double: NativeFunction = {
  nativeFunctionSync(state: State, args: AnyValue[]): NativeResult {
    if (args.length !== 1) {
      return {
        error: state.makeError(
          StatusCode.INVALID_ARGUMENT,
          "double() requires exactly one argument."
        )
      }
    }

    const val = args[0]

    switch (val[0]) {
      case Type.INT64:
      case Type.UINT64:
        return { result: [Type.DOUBLE, Number(val[1])] }
      case Type.DOUBLE:
        return { result: val }
      case Type.STRING: {
        const n = Number(val[1])
        if (Number.isNaN(n)) {
          return {
            error: state.makeError(
              StatusCode.INVALID_ARGUMENT,
              `could not convert "${val[1]}" to double.`
            )
          }
        }
        return { result: [Type.DOUBLE, n] }
      }
      case Type.ENUM:
        return { result: [Type.DOUBLE, val[1][1]] }

      case Type.OBJECT:
      case Type.MAP:
      case Type.LIST:
      case Type.TYPE:
      case Type.CALLABLE:
      case Type.NULL:
      case Type.BOOL:
      case Type.BYTES:
        return {
          error: state.makeError(
            StatusCode.INVALID_ARGUMENT,
            `cannot convert ${Type[val[0]]} to double`
          )
        }
    }
  }
}

/**
 * Native type cast to bool
 */
export const bool: NativeFunction = {
  nativeFunctionSync(state: State, args: AnyValue[]): NativeResult {
    if (args.length !== 1) {
      return {
        error: state.makeError(
          StatusCode.INVALID_ARGUMENT,
          "bool() requires exactly one argument."
        )
      }
    }
    return { result: [Type.BOOL, toBoolean(args[0])] }
  }
}

/**
 * Native type cast to string
 */
export const string: NativeFunction = {
  nativeFunctionSync(state: State, args: AnyValue[]): NativeResult {
    if (args.length !== 1) {
      return {
        error: state.makeError(
          StatusCode.INVALID_ARGUMENT,
          "string() requires exactly one argument."
        )
      }
    }

    const val = args[0]

    switch (val[0]) {
      case Type.BOOL:
      case Type.INT64:
      case Type.UINT64:
      case Type.DOUBLE:
        return { result: [Type.STRING, String(val[1])] }
      case Type.STRING:
        return { result: val }
      case Type.ENUM:
        return { result: [Type.STRING, String(val[1][1])] }
      case Type.NULL:
        return { result: [Type.STRING, "null"] }
      case Type.TYPE:
        return { result: [Type.STRING, `[type ${val[1]}]`] }

      case Type.OBJECT:
      case Type.MAP:
      case Type.LIST:
      case Type.CALLABLE:
      case Type.BYTES:
        return {
          error: state.makeError(
            StatusCode.INVALID_ARGUMENT,
            `cannot convert ${Type[val[0]]} to string`
          )
        }
    }
  }
}

/**
 * Native length operator
 */
export const len: NativeFunction = {
  nativeFunctionSync(state: State, args: AnyValue[]): NativeResult {
    if (args.length !== 1) {
      return {
        error: state.makeError(
          StatusCode.INVALID_ARGUMENT,
          "len() requires exactly one argument."
        )
      }
    }

    const val = args[0]

    switch (val[0]) {
      case Type.MAP:
        return { result: [Type.INT64, BigInt(val[1].size)] }

      case Type.LIST:
      case Type.STRING:
      case Type.BYTES:
        return { result: [Type.INT64, BigInt(val[1].length)] }

      case Type.OBJECT:
      case Type.BOOL:
      case Type.INT64:
      case Type.UINT64:
      case Type.DOUBLE:
      case Type.ENUM:
      case Type.NULL:
      case Type.TYPE:
      case Type.CALLABLE:
        return {
          error: state.makeError(
            StatusCode.INVALID_ARGUMENT,
            `len: cannot compute length of type ${Type[val[0]]}`
          )
        }
    }
  }
}

export const nativeFunctions: Record<string, NativeFunction> = {
  len,
  bool,
  string,
  double,
  int64,
  uint64
}

/**
 * Handling for builtin unary operators.
 */
export function unop(
  state: State,
  unop: Unop,
  arg: AnyValue
): AnyValue | undefined {
  const [type, value] = arg
  switch (unop) {
    case Unop.MINUS:
      switch (type) {
        case Type.INT64:
          return [Type.INT64, -value]
        case Type.DOUBLE:
          return [Type.DOUBLE, -value]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Unary '-' operator: invalid argument, expected int or double`
          )
          return undefined
      }

    case Unop.NOT:
      switch (type) {
        case Type.BOOL:
          return [Type.BOOL, !value]
        case Type.NULL:
          return [Type.BOOL, true]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Unary '!' operator: invalid argument, expected boolean or null`
          )
          return undefined
      }

    default:
      state.throwError(StatusCode.INVALID_ARGUMENT, `Unknown unary operator`)
      return undefined
  }
}

/**
 * Handling for builtin binary operators.
 */
export function binop(
  state: State,
  binop: Binop,
  arg1: AnyValue,
  arg2: AnyValue
): AnyValue | undefined {
  const [type1, value1] = arg1
  const [type2, value2] = arg2

  switch (binop) {
    case Binop.ADD:
      if (type1 !== type2) {
        state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `Binary operator ${Binop[binop]}: both arguments must have the same type. (lhs was ${Type[type1]}, rhs was ${Type[type2]})`
        )
        return undefined
      }
      switch (type1) {
        case Type.INT64:
          return [Type.INT64, BigInt.asIntN(64, value1 + (value2 as bigint))]
        case Type.UINT64:
          return [Type.UINT64, BigInt.asUintN(64, value1 + (value2 as bigint))]
        case Type.DOUBLE:
          return [Type.DOUBLE, value1 + (value2 as number)]
        case Type.STRING:
          return [Type.STRING, value1 + (value2 as string)]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Binary operator +: cannot operate on type ${Type[type1]}`
          )
          return undefined
      }
    case Binop.SUB:
      if (type1 !== type2) {
        state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `Binary operator ${Binop[binop]}: both arguments must have the same type. (lhs was ${Type[type1]}, rhs was ${Type[type2]})`
        )
        return undefined
      }
      switch (type1) {
        case Type.INT64:
          return [Type.INT64, BigInt.asIntN(64, value1 - (value2 as bigint))]
        case Type.UINT64:
          return [Type.UINT64, BigInt.asUintN(64, value1 - (value2 as bigint))]
        case Type.DOUBLE:
          return [Type.DOUBLE, value1 - (value2 as number)]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Binary operator -: cannot operate on type ${Type[type1]}`
          )
          return undefined
      }
    case Binop.MUL:
      if (type1 !== type2) {
        state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `Binary operator ${Binop[binop]}: both arguments must have the same type. (lhs was ${Type[type1]}, rhs was ${Type[type2]})`
        )
        return undefined
      }
      switch (type1) {
        case Type.INT64:
          return [Type.INT64, BigInt.asIntN(64, value1 * (value2 as bigint))]
        case Type.UINT64:
          return [Type.UINT64, BigInt.asUintN(64, value1 * (value2 as bigint))]
        case Type.DOUBLE:
          return [Type.DOUBLE, value1 * (value2 as number)]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Binary operator *: cannot operate on type ${Type[type1]}`
          )
          return undefined
      }
    case Binop.DIV:
      if (type1 !== type2) {
        state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `Binary operator ${Binop[binop]}: both arguments must have the same type. (lhs was ${Type[type1]}, rhs was ${Type[type2]})`
        )
        return undefined
      }
      switch (type1) {
        case Type.INT64:
          return [Type.INT64, BigInt.asIntN(64, value1 / (value2 as bigint))]
        case Type.UINT64:
          return [Type.UINT64, BigInt.asUintN(64, value1 / (value2 as bigint))]
        case Type.DOUBLE:
          return [Type.DOUBLE, value1 / (value2 as number)]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Binary operator +: cannot operate on type ${Type[type1]}`
          )
          return undefined
      }
    case Binop.MOD:
      if (type1 !== type2) {
        state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `Binary operator ${Binop[binop]}: both arguments must have the same type. (lhs was ${Type[type1]}, rhs was ${Type[type2]})`
        )
        return undefined
      }
      switch (type1) {
        case Type.INT64:
          return [Type.INT64, BigInt.asIntN(64, value1 % (value2 as bigint))]
        case Type.UINT64:
          return [Type.UINT64, BigInt.asUintN(64, value1 % (value2 as bigint))]
        case Type.DOUBLE:
          return [Type.DOUBLE, value1 % (value2 as number)]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Binary operator %: cannot operate on type ${Type[type1]}`
          )
          return undefined
      }
    case Binop.POW:
      if (type1 !== type2) {
        state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `Binary operator ${Binop[binop]}: both arguments must have the same type. (lhs was ${Type[type1]}, rhs was ${Type[type2]})`
        )
        return undefined
      }
      switch (type1) {
        case Type.INT64:
          return [Type.INT64, BigInt.asIntN(64, value1 ** (value2 as bigint))]
        case Type.UINT64:
          return [Type.UINT64, BigInt.asUintN(64, value1 ** (value2 as bigint))]
        case Type.DOUBLE:
          return [Type.DOUBLE, value1 ** (value2 as number)]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `Binary operator ^ : cannot operate on type ${Type[type1]}`
          )
          return undefined
      }
    case Binop.AND:
      return [Type.BOOL, toBoolean(arg1) && toBoolean(arg2)]
    case Binop.OR:
      return [Type.BOOL, toBoolean(arg1) || toBoolean(arg2)]
    default:
      return undefined
  }
}
