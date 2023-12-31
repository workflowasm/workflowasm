// @generated by protoc-gen-es v1.4.2 with parameter "target=ts"
// @generated from file workflowasm/net/v1/worker_orchestrator_service.proto (package workflowasm.net.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";

/**
 * Union-typed message sent from Worker to Orchestrator.
 *
 * @generated from message workflowasm.net.v1.WorkerStream
 */
export class WorkerStream extends Message<WorkerStream> {
  constructor(data?: PartialMessage<WorkerStream>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.WorkerStream";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): WorkerStream {
    return new WorkerStream().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): WorkerStream {
    return new WorkerStream().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): WorkerStream {
    return new WorkerStream().fromJsonString(jsonString, options);
  }

  static equals(a: WorkerStream | PlainMessage<WorkerStream> | undefined, b: WorkerStream | PlainMessage<WorkerStream> | undefined): boolean {
    return proto3.util.equals(WorkerStream, a, b);
  }
}

/**
 * First message sent from Worker to Orchestrator. Exactly one Handshake
 * must be sent, and it must precede any other message. The Worker must send
 * its handshake first, to which the Orchestrator will reply with its
 * Handshake.
 *
 * @generated from message workflowasm.net.v1.WorkerStream.Handshake
 */
export class WorkerStream_Handshake extends Message<WorkerStream_Handshake> {
  /**
   * Worker's hint to the Orchestrator as to how the Worker's string ID should
   * be generated. This can be used to inject information from the Worker's
   * environment, like pod IP, etc.
   *
   * @generated from field: string id_advice = 1;
   */
  idAdvice = "";

  /**
   * Maximum parallel jobs to be enqueued on a Worker. The Orchestrator
   * may treat this as a hint rather than a hard limit; hard limits should
   * be enforced by having the Worker refuse jobs when it is overloaded.
   *
   * @generated from field: int32 parallelism = 2;
   */
  parallelism = 0;

  constructor(data?: PartialMessage<WorkerStream_Handshake>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.WorkerStream.Handshake";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "id_advice", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 2, name: "parallelism", kind: "scalar", T: 5 /* ScalarType.INT32 */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): WorkerStream_Handshake {
    return new WorkerStream_Handshake().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): WorkerStream_Handshake {
    return new WorkerStream_Handshake().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): WorkerStream_Handshake {
    return new WorkerStream_Handshake().fromJsonString(jsonString, options);
  }

  static equals(a: WorkerStream_Handshake | PlainMessage<WorkerStream_Handshake> | undefined, b: WorkerStream_Handshake | PlainMessage<WorkerStream_Handshake> | undefined): boolean {
    return proto3.util.equals(WorkerStream_Handshake, a, b);
  }
}

/**
 * Standard liveness check. When received, must respond with Pong on
 * the outgoing stream.
 *
 * @generated from message workflowasm.net.v1.WorkerStream.Ping
 */
export class WorkerStream_Ping extends Message<WorkerStream_Ping> {
  constructor(data?: PartialMessage<WorkerStream_Ping>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.WorkerStream.Ping";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): WorkerStream_Ping {
    return new WorkerStream_Ping().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): WorkerStream_Ping {
    return new WorkerStream_Ping().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): WorkerStream_Ping {
    return new WorkerStream_Ping().fromJsonString(jsonString, options);
  }

  static equals(a: WorkerStream_Ping | PlainMessage<WorkerStream_Ping> | undefined, b: WorkerStream_Ping | PlainMessage<WorkerStream_Ping> | undefined): boolean {
    return proto3.util.equals(WorkerStream_Ping, a, b);
  }
}

/**
 * Standard liveness check. Sent to the outgoing stream after receiving
 * a corresponding Ping on the incoming stream.
 *
 * @generated from message workflowasm.net.v1.WorkerStream.Pong
 */
export class WorkerStream_Pong extends Message<WorkerStream_Pong> {
  constructor(data?: PartialMessage<WorkerStream_Pong>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.WorkerStream.Pong";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): WorkerStream_Pong {
    return new WorkerStream_Pong().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): WorkerStream_Pong {
    return new WorkerStream_Pong().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): WorkerStream_Pong {
    return new WorkerStream_Pong().fromJsonString(jsonString, options);
  }

  static equals(a: WorkerStream_Pong | PlainMessage<WorkerStream_Pong> | undefined, b: WorkerStream_Pong | PlainMessage<WorkerStream_Pong> | undefined): boolean {
    return proto3.util.equals(WorkerStream_Pong, a, b);
  }
}

/**
 * Union-typed message sent from Orchestrator to Worker.
 *
 * @generated from message workflowasm.net.v1.OrchestratorStream
 */
export class OrchestratorStream extends Message<OrchestratorStream> {
  /**
   * @generated from oneof workflowasm.net.v1.OrchestratorStream.message_kind
   */
  messageKind: {
    /**
     * @generated from field: workflowasm.net.v1.OrchestratorStream.Handshake handshake = 1;
     */
    value: OrchestratorStream_Handshake;
    case: "handshake";
  } | {
    /**
     * @generated from field: workflowasm.net.v1.OrchestratorStream.Ping ping = 2;
     */
    value: OrchestratorStream_Ping;
    case: "ping";
  } | {
    /**
     * @generated from field: workflowasm.net.v1.OrchestratorStream.Pong pong = 3;
     */
    value: OrchestratorStream_Pong;
    case: "pong";
  } | { case: undefined; value?: undefined } = { case: undefined };

  constructor(data?: PartialMessage<OrchestratorStream>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.OrchestratorStream";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "handshake", kind: "message", T: OrchestratorStream_Handshake, oneof: "message_kind" },
    { no: 2, name: "ping", kind: "message", T: OrchestratorStream_Ping, oneof: "message_kind" },
    { no: 3, name: "pong", kind: "message", T: OrchestratorStream_Pong, oneof: "message_kind" },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): OrchestratorStream {
    return new OrchestratorStream().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): OrchestratorStream {
    return new OrchestratorStream().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): OrchestratorStream {
    return new OrchestratorStream().fromJsonString(jsonString, options);
  }

  static equals(a: OrchestratorStream | PlainMessage<OrchestratorStream> | undefined, b: OrchestratorStream | PlainMessage<OrchestratorStream> | undefined): boolean {
    return proto3.util.equals(OrchestratorStream, a, b);
  }
}

/**
 * @generated from message workflowasm.net.v1.OrchestratorStream.Handshake
 */
export class OrchestratorStream_Handshake extends Message<OrchestratorStream_Handshake> {
  /**
   * The authoritative final ID string assigned by the Orchestrator to the
   * Worker. This field is mandatory and the returned ID must be utilized
   * in all future exchanges that require a worker ID.
   *
   * @generated from field: string worker_id = 1;
   */
  workerId = "";

  constructor(data?: PartialMessage<OrchestratorStream_Handshake>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.OrchestratorStream.Handshake";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "worker_id", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): OrchestratorStream_Handshake {
    return new OrchestratorStream_Handshake().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): OrchestratorStream_Handshake {
    return new OrchestratorStream_Handshake().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): OrchestratorStream_Handshake {
    return new OrchestratorStream_Handshake().fromJsonString(jsonString, options);
  }

  static equals(a: OrchestratorStream_Handshake | PlainMessage<OrchestratorStream_Handshake> | undefined, b: OrchestratorStream_Handshake | PlainMessage<OrchestratorStream_Handshake> | undefined): boolean {
    return proto3.util.equals(OrchestratorStream_Handshake, a, b);
  }
}

/**
 * Standard liveness check. When received, must respond with Pong on
 * the outgoing stream.
 *
 * @generated from message workflowasm.net.v1.OrchestratorStream.Ping
 */
export class OrchestratorStream_Ping extends Message<OrchestratorStream_Ping> {
  constructor(data?: PartialMessage<OrchestratorStream_Ping>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.OrchestratorStream.Ping";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): OrchestratorStream_Ping {
    return new OrchestratorStream_Ping().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): OrchestratorStream_Ping {
    return new OrchestratorStream_Ping().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): OrchestratorStream_Ping {
    return new OrchestratorStream_Ping().fromJsonString(jsonString, options);
  }

  static equals(a: OrchestratorStream_Ping | PlainMessage<OrchestratorStream_Ping> | undefined, b: OrchestratorStream_Ping | PlainMessage<OrchestratorStream_Ping> | undefined): boolean {
    return proto3.util.equals(OrchestratorStream_Ping, a, b);
  }
}

/**
 * Standard liveness check. Sent to the outgoing stream after receiving
 * a corresponding Ping on the incoming stream.
 *
 * @generated from message workflowasm.net.v1.OrchestratorStream.Pong
 */
export class OrchestratorStream_Pong extends Message<OrchestratorStream_Pong> {
  constructor(data?: PartialMessage<OrchestratorStream_Pong>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.OrchestratorStream.Pong";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): OrchestratorStream_Pong {
    return new OrchestratorStream_Pong().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): OrchestratorStream_Pong {
    return new OrchestratorStream_Pong().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): OrchestratorStream_Pong {
    return new OrchestratorStream_Pong().fromJsonString(jsonString, options);
  }

  static equals(a: OrchestratorStream_Pong | PlainMessage<OrchestratorStream_Pong> | undefined, b: OrchestratorStream_Pong | PlainMessage<OrchestratorStream_Pong> | undefined): boolean {
    return proto3.util.equals(OrchestratorStream_Pong, a, b);
  }
}

/**
 * Request that the Worker begin or resume the given Job.
 *
 * @generated from message workflowasm.net.v1.OrchestratorStream.Job
 */
export class OrchestratorStream_Job extends Message<OrchestratorStream_Job> {
  /**
   * Unique id of the Job.
   *
   * @generated from field: string id = 1;
   */
  id = "";

  constructor(data?: PartialMessage<OrchestratorStream_Job>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "workflowasm.net.v1.OrchestratorStream.Job";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "id", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): OrchestratorStream_Job {
    return new OrchestratorStream_Job().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): OrchestratorStream_Job {
    return new OrchestratorStream_Job().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): OrchestratorStream_Job {
    return new OrchestratorStream_Job().fromJsonString(jsonString, options);
  }

  static equals(a: OrchestratorStream_Job | PlainMessage<OrchestratorStream_Job> | undefined, b: OrchestratorStream_Job | PlainMessage<OrchestratorStream_Job> | undefined): boolean {
    return proto3.util.equals(OrchestratorStream_Job, a, b);
  }
}

