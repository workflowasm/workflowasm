import { Message } from "@bufbuild/protobuf"

export enum TypeTag {
  TYPE_UNDEFINED = 0,
  TYPE_NULL = 1,
  TYPE_BOOLEAN = 2,
  TYPE_INT64 = 3,
  TYPE_UINT64 = 4,
  TYPE_DOUBLE = 5,
  TYPE_STRING = 6,
  TYPE_BYTES = 7,
  TYPE_ENUM = 8,
  TYPE_OBJECT = 9,
  TYPE_MAP = 10,
  TYPE_LIST = 11,
  TYPE_TYPE = 12,
  TYPE_CLOSURE = 13,
  TYPE_REF = 14
}

export type EnumValue = [type: string, value: number]

export type ObjectValue = Message

export type MapKey = bigint | string | boolean

export type MapValue = Map<MapKey, TaggedValue>

export type ListValue = TaggedValue[]

export type RefValue = number

export type ClosureValue = [
  function: string,
  boundArgs: TaggedValue[] | undefined,
  upvalues: Map<string, RefValue> | undefined
]

export type TaggedValue =
  | [TypeTag.TYPE_UNDEFINED, undefined]
  | [TypeTag.TYPE_NULL, null]
  | [TypeTag.TYPE_BOOLEAN, boolean]
  | [TypeTag.TYPE_INT64, bigint]
  | [TypeTag.TYPE_UINT64, bigint]
  | [TypeTag.TYPE_DOUBLE, number]
  | [TypeTag.TYPE_STRING, string]
  | [TypeTag.TYPE_BYTES, Uint8Array]
  | [TypeTag.TYPE_ENUM, EnumValue]
  | [TypeTag.TYPE_OBJECT, ObjectValue]
  | [TypeTag.TYPE_MAP, MapValue]
  | [TypeTag.TYPE_LIST, ListValue]
  | [TypeTag.TYPE_TYPE, string]
  | [TypeTag.TYPE_CLOSURE, ClosureValue]
  | [TypeTag.TYPE_REF, RefValue]

export const Null: TaggedValue = [TypeTag.TYPE_NULL, null]

export type RefCell = [value: TaggedValue, refCount: number]

export type Heap = Map<number, RefCell>

/**
 * Convert any value to Boolean. `null`, `undefined`, and Boolean `false`
 * are considered falsy values; all other values are considered truthy.
 *
 * NB: Integer and double `0` values are truthy!
 */
export function toBoolean(value: TaggedValue): boolean {
  switch (value[0]) {
    case TypeTag.TYPE_UNDEFINED:
    case TypeTag.TYPE_NULL:
      return false

    case TypeTag.TYPE_BOOLEAN:
      return value[1]

    default:
      return true
  }
}

/**
 * If a value is a heap pointer, dereference it.
 */
export function deref(value: TaggedValue, heap: Heap): TaggedValue | undefined {
  switch (value[0]) {
    case TypeTag.TYPE_REF:
      return heap.get(value[1])?.[0]

    default:
      return value
  }
}

/**
 * Convert an integral tagged value to a number clamped in uint32 range.
 */
export function integralToU32(
  value: TaggedValue | undefined
): number | undefined {
  if (value === undefined) return undefined
  switch (value[0]) {
    case TypeTag.TYPE_INT64:
    case TypeTag.TYPE_UINT64:
      return Number(BigInt.asUintN(32, value[1]))

    default:
      return undefined
  }
}
