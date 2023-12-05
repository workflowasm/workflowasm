import { Message } from "@bufbuild/protobuf"
import { Type, CallableType, Binop, Unop } from "@workflowasm/protocols-js"

export { Type, CallableType, Binop, Unop }

export type EnumValue = [type: string, value: number]

export type ObjectValue = Message

export type MapKey = bigint | string | boolean

export type MapValue = Map<MapKey, AnyValue>

export type ListValue = AnyValue[]

export type RefValue = number

export type NativeCallable = { type: CallableType.NATIVE; id: string }

export type FunctionCallable = { type: CallableType.FUNCTION; id: string }

export type ClosureCallable = {
  type: CallableType.CLOSURE
  id: string
  boundArgs: AnyValue[] | undefined
  upvalues: Map<string, RefValue> | undefined
}

export type CallableValue = NativeCallable | FunctionCallable | ClosureCallable

export type AnyValue =
  | [Type.NULL, null]
  | [Type.BOOL, boolean]
  | [Type.INT64, bigint]
  | [Type.UINT64, bigint]
  | [Type.DOUBLE, number]
  | [Type.STRING, string]
  | [Type.BYTES, Uint8Array]
  | [Type.ENUM, EnumValue]
  | [Type.OBJECT, ObjectValue]
  | [Type.MAP, MapValue]
  | [Type.LIST, ListValue]
  | [Type.TYPE, string]
  | [Type.CALLABLE, CallableValue]

export const Null: AnyValue = [Type.NULL, null]

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
