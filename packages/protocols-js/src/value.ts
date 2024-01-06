// Value representations for JS VMs that are more efficient than passing
// around oneof Protobuf objects.
import { Message } from "@bufbuild/protobuf"
import { Type, CallableType } from "./gen/workflowasm/lang/v1/value_pb.js"

export type EnumVal = [type: string, value: number]

export type ObjectVal = Message

export type MapKey = bigint | string | boolean
export type MapVal = Map<MapKey, AnyVal>

export type ListVal = AnyVal[]

export type NativeCallable = { type: CallableType.NATIVE; id: string }
export type FunctionCallable = { type: CallableType.FUNCTION; id: string }
export type ClosureCallable = {
  type: CallableType.CLOSURE
  id: string
  boundArgs: AnyVal[] | undefined
}
export type CallableVal = NativeCallable | FunctionCallable | ClosureCallable

export type AnyVal =
  | [Type.NULL, null]
  | [Type.BOOL, boolean]
  | [Type.INT64, bigint]
  | [Type.UINT64, bigint]
  | [Type.DOUBLE, number]
  | [Type.STRING, string]
  | [Type.BYTES, Uint8Array]
  | [Type.ENUM, EnumVal]
  | [Type.OBJECT, ObjectVal]
  | [Type.MAP, MapVal]
  | [Type.LIST, ListVal]
  | [Type.TYPE, string]
  | [Type.CALLABLE, CallableVal]

export const Null: AnyVal = [Type.NULL, null]
