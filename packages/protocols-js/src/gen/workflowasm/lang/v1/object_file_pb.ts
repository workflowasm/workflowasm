// @generated by protoc-gen-es v1.4.2 with parameter "target=ts"
// @generated from file workflowasm/lang/v1/object_file.proto (package workflowasm.lang.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";
import { Function } from "./function_pb.js";

/**
 * The output of a compilation of a single module
 * file.
 *
 * @generated from message workflowasm.lang.v1.ObjectFile
 */
export class ObjectFile extends Message<ObjectFile> {
  /**
   * Package to which the functions in this module
   * belong.
   *
   * @generated from field: string package = 1;
   */
  package = "";

  /**
   * The functions defined in this object module
   *
   * @generated from field: map<string, workflowasm.lang.v1.Function> functions = 4;
   */
  functions: { [key: string]: Function } = {};

  constructor(data?: PartialMessage<ObjectFile>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.lang.v1.ObjectFile";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "package", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 4, name: "functions", kind: "map", K: 9 /* ScalarType.STRING */, V: {kind: "message", T: Function} },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): ObjectFile {
    return new ObjectFile().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): ObjectFile {
    return new ObjectFile().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): ObjectFile {
    return new ObjectFile().fromJsonString(jsonString, options);
  }

  static equals(a: ObjectFile | PlainMessage<ObjectFile> | undefined, b: ObjectFile | PlainMessage<ObjectFile> | undefined): boolean {
    return proto3.util.equals(ObjectFile, a, b);
  }
}

