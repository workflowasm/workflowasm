// @generated by protoc-gen-es v1.4.2 with parameter "target=ts"
// @generated from file workflowasm/lang/v1/function.proto (package workflowasm.lang.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";
import { Instruction } from "./instruction_pb.js";
import { Value } from "./value_pb.js";

/**
 * A single function segment in an assembly
 *
 * @generated from message workflowasm.lang.v1.Function
 */
export class Function extends Message<Function> {
  /**
   * The `Instruction`s comprising the function.
   *
   * @generated from field: repeated workflowasm.lang.v1.Instruction instructions = 1;
   */
  instructions: Instruction[] = [];

  /**
   * The function's constant table, used with `OP_PUSHK`
   *
   * @generated from field: repeated workflowasm.lang.v1.Value constants = 2;
   */
  constants: Value[] = [];

  constructor(data?: PartialMessage<Function>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.lang.v1.Function";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "instructions", kind: "message", T: Instruction, repeated: true },
    { no: 2, name: "constants", kind: "message", T: Value, repeated: true },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): Function {
    return new Function().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): Function {
    return new Function().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): Function {
    return new Function().fromJsonString(jsonString, options);
  }

  static equals(a: Function | PlainMessage<Function> | undefined, b: Function | PlainMessage<Function> | undefined): boolean {
    return proto3.util.equals(Function, a, b);
  }
}
