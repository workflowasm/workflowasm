// JavaScript representation of `cel.expr.Value`, designed for efficient
// storage of protobuf objects and Maps, compared with raw CEL values
// which require expensive decoding and encoding.
//
// Designed for easy conversion to/from CEL values when needed.

import { Message, Any, IMessageTypeRegistry } from "@bufbuild/protobuf"
import {
  EnumValue,
  Value,
  MapValue,
  ListValue,
  MapValue_Entry
} from "@workflowasm/protocols-js"

export type MapKeyT = boolean | bigint | string

export type ValueRepresentationT =
  | { case: "nullValue"; value: 0 }
  | { case: "boolValue"; value: boolean }
  | { case: "int64Value"; value: bigint }
  | { case: "uint64Value"; value: bigint }
  | { case: "doubleValue"; value: number }
  | { case: "stringValue"; value: string }
  | { case: "bytesValue"; value: Uint8Array }
  | { case: "enumValue"; value: EnumValue }
  | { case: "objectValue"; value: Any }
  | { case: "mapValue"; value: MapValue }
  | { case: "listValue"; value: ListValue }
  | { case: "typeValue"; value: string }
  | { case: "messageValue"; value: Message }
  | { case: "fastMapValue"; value: Map<MapKeyT, ValueRepresentationT> }
  | { case: "fastListValue"; value: ValueRepresentationT[] }
  | { case: undefined; value: undefined }

function toMapKey(value: Value): MapKeyT {
  switch (value.kind.case) {
    case "boolValue":
    case "int64Value":
    case "uint64Value":
    case "stringValue":
      return value.kind.value

    default:
      throw new Error(`Invalid map key of type '${value.kind.case}'`)
  }
}

function fromMapKey(key: MapKeyT): Value {
  switch (typeof key) {
    case "boolean":
      return new Value({ kind: { case: "boolValue", value: key } })
    case "bigint":
      return new Value({ kind: { case: "int64Value", value: key } })
    case "string":
      return new Value({ kind: { case: "stringValue", value: key } })
    default:
      throw new Error(
        `Encountered invalid map key type '${typeof key}' while encoding fast map.`
      )
  }
}

/**
 * Convert from a `cel.expr.Value` protobuf into a `ValueRepresentationT`
 * representation, optionally optimizing list and map types to native JS
 * equivalents, and `Any` types to their corresponding decoded `Message`s
 */
export function fromValue(
  value: Value,
  options?: { optimizeMaps: boolean; typeRegistry?: IMessageTypeRegistry }
): ValueRepresentationT {
  if (options?.optimizeMaps ?? false) {
    switch (value.kind.case) {
      case "mapValue": {
        const map = new Map<MapKeyT, ValueRepresentationT>()
        for (const { key, value: val } of value.kind.value.entries) {
          if (key !== undefined && val !== undefined) {
            map.set(toMapKey(key), fromValue(val, options))
          }
        }
        return { case: "fastMapValue", value: map }
      }

      case "listValue": {
        const list = value.kind.value.values.map((x) => fromValue(x, options))
        return { case: "fastListValue", value: list }
      }

      default:
    }
  }

  if (options?.typeRegistry !== undefined) {
    if (value.kind.case === "objectValue") {
      const message = value.kind.value.unpack(options.typeRegistry)
      if (message === undefined) {
        throw new Error(
          `Could not decode message from google.protobuf.Any with type url '${value.kind.value.typeUrl}'`
        )
      }
      return { case: "messageValue", value: message }
    }
  }

  return value.kind
}

/**
 * Converts internal `ValueRepresentationT`s back into `cel.expr.Value` protobuf
 * objects.
 */
export function toValue(valueRep: ValueRepresentationT): Value {
  switch (valueRep.case) {
    case "messageValue":
      return new Value({
        kind: { case: "objectValue", value: Any.pack(valueRep.value) }
      })

    case "fastListValue":
      return new Value({
        kind: {
          case: "listValue",
          value: new ListValue({
            values: valueRep.value.map((x) => toValue(x))
          })
        }
      })

    case "fastMapValue":
      return new Value({
        kind: {
          case: "mapValue",
          value: new MapValue({
            entries: Array.from(
              valueRep.value.entries(),
              ([k, v]) =>
                new MapValue_Entry({ key: fromMapKey(k), value: toValue(v) })
            )
          })
        }
      })

    default:
      return new Value({ kind: valueRep })
  }
}
