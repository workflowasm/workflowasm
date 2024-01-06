import {
  Type,
  CallableType,
  Binop,
  Unop,
  Null,
  type AnyVal,
  type EnumVal,
  type ObjectVal,
  type MapKey,
  type MapVal,
  type ListVal,
  type CallableVal,
  type NativeCallable,
  type FunctionCallable,
  type ClosureCallable
} from "@workflowasm/protocols-js"

export {
  Type,
  CallableType,
  Binop,
  Unop,
  type MapKey,
  Null,
  type NativeCallable,
  type FunctionCallable,
  type ClosureCallable
}

// TODO: fix these aliases downstream
export type EnumValue = EnumVal
export type ObjectValue = ObjectVal
export type MapValue = MapVal
export type ListValue = ListVal
export type RefValue = number
export type CallableValue = CallableVal
export type AnyValue = AnyVal

/**
 * When a native operation needs to return a result to the VM, this is the
 * type signature.
 *
 * Native operations **MUST NOT** throw JS exceptions into the VM's call stack
 * as this constitutes non-serializable information. Instead, return an error
 * result here.
 */
export type NativeResult =
  | { result: AnyValue; error?: undefined }
  | { result?: undefined; error: AnyValue }

export type RefCell = [value: AnyValue, refCount: number]

export type Heap = Map<number, RefCell>

/**
 * Convert any value to Boolean. `null`, `undefined`, and Boolean `false`
 * are considered falsy values; all other values are considered truthy.
 *
 * NB: Integer and double `0` values are truthy!
 */
export function toBoolean(value: AnyValue): boolean {
  switch (value[0]) {
    case Type.NULL:
      return false

    case Type.BOOL:
      return value[1]

    default:
      return true
  }
}

/**
 * Convert an integral tagged value to a number clamped in uint32 range.
 */
export function toU32(value: AnyValue | undefined): number | undefined {
  if (value === undefined) return undefined
  switch (value[0]) {
    case Type.INT64:
    case Type.UINT64:
      return Number(BigInt.asUintN(32, value[1]))

    case Type.DOUBLE:
      return Math.max(0, Math.min(4294967295, value[1]))

    default:
      return undefined
  }
}
