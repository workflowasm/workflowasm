// Value representations for JS VMs that are more efficient than passing
// around oneof Protobuf objects.
import { Message } from "@bufbuild/protobuf"
import { Type } from "./gen/workflowasm/lang/v1/value_pb.js"
import { Opcode } from "./gen/workflowasm/lang/v1/instruction_pb.js"

/** A typed enum value, with the Protobuf type attached. */
export type EnumVal = [type: string, value: number]

/** A typed protobuf message value. */
export type MessageVal = Message

export type MapKey = bigint | string | boolean
/** A map value. */
export type MapVal = Map<MapKey, AnyVal>

/** A list value, represented as a JS array. */
export type ListVal = AnyVal[]

/** A callable value. */
export type CallableVal = {
  package: string
  id: string
  semver: string
  boundArgs?: AnyVal[]
  captures?: Map<string, AnyVal>
}

/** JS tuple representation of any WorkflowASM value. */
export type AnyVal =
  | [Type.UNDEFINED, undefined]
  | [Type.NULL, null]
  | [Type.BOOL, boolean]
  | [Type.INT64, bigint]
  | [Type.UINT64, bigint]
  | [Type.DOUBLE, number]
  | [Type.STRING, string]
  | [Type.BYTES, Uint8Array]
  | [Type.ENUM, EnumVal]
  | [Type.MESSAGE, MessageVal]
  | [Type.MAP, MapVal]
  | [Type.LIST, ListVal]
  | [Type.TYPE, string]
  | [Type.CALLABLE, CallableVal]

export const Undefined: Readonly<AnyVal> = [Type.UNDEFINED, undefined]
export const Null: Readonly<AnyVal> = [Type.NULL, null]

export type AsmInstruction = [opcode: Opcode, arg: number]

export type AsmProgram = AsmInstruction[]

export type ConstantTable = AnyVal[]

/** Display a readable debug representation of a value. */
export function dumpValue(value: AnyVal): string {
  switch (value[0]) {
    case Type.UNDEFINED:
      return "undefined"
    case Type.NULL:
      return "null"
    case Type.BOOL:
    case Type.INT64:
    case Type.UINT64:
    case Type.DOUBLE:
      return String(value[1])
    case Type.STRING:
      return '"' + value[1] + '"'
    case Type.ENUM:
      return `enum(${value[1][0]}, ${value[1][1]})`
    case Type.MESSAGE:
      return value[1].toJsonString()
    case Type.MAP:
      return (
        "{ " +
        Array.from(value[1], ([k, v]) => `"${k}": ${dumpValue(v)}`).join(",") +
        " }"
      )
    case Type.LIST:
      return "[" + value[1].map((x) => dumpValue(x)).join(", ") + "]"
    case Type.TYPE:
      return `(type ${value[1]})`
    case Type.CALLABLE:
      return `(callable ${value[1].id})`
    case Type.BYTES:
      return `(${value[1].length} bytes)`
  }
}

/** Display a readable debug representaiton of an ASM program */
export function dumpAsm(
  asm: AsmProgram,
  ktable: ConstantTable,
  prefix: string = ""
): string {
  const kstr = ktable
    .map((k, i) => `${prefix}  ${i}: ${dumpValue(k)}`)
    .join("\n")
  const astr = asm
    .map((k, i) => `${prefix}  ${i}: ${Opcode[k[0]]} ${k[1]}`)
    .join("\n")
  return `${prefix}Constants:\n${kstr}\n${prefix}\n${prefix}Assembly:\n${astr}`
}
