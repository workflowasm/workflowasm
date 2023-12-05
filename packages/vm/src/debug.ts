import { type CallStack, Frame, FrameType, type Stack } from "./stack.js"
import { Opcode, State } from "./state.js"
import { type AnyValue, type Heap, Type, CallableType } from "./value.js"

function dumpHeap(_heap: Heap): string {
  return ""
}

function dumpValue(x: AnyValue | undefined): string {
  if (x === undefined) return "undefined"
  switch (x[0]) {
    case Type.NULL:
      return "null"
    case Type.BOOL:
    case Type.INT64:
    case Type.UINT64:
    case Type.DOUBLE:
      return String(x[1])
    case Type.STRING:
      return `"${x[1]}"`
    case Type.BYTES:
      return `(Uint8Array[${x[1].length}])`
    case Type.ENUM:
      return `(Enum ${x[1][0]}: ${x[1][1]})`
    case Type.OBJECT:
      return x[1].toJsonString()
    case Type.MAP:
      return `(Map)`
    case Type.LIST:
      return `(List)`
    case Type.TYPE:
      return `(Type ${x[1]})`
    case Type.CALLABLE:
      return `(Callable ${CallableType[x[1].type]}: ${x[1].id})`
  }
}

function dumpValueStack(stack: Stack | undefined): string {
  if (stack === undefined) return "none"
  return stack.map((x) => dumpValue(x)).join(", ")
}

function dumpFrame(state: State, frame: Frame): string {
  return `Frame: ${FrameType[frame.type]} ${
    frame.fp
      ? frame.fp +
        "@" +
        frame.ip +
        " (" +
        Opcode[(state._config.getInstruction(frame.fp, frame.ip) ?? [0])[0]] +
        ")"
      : ""
  }\n${
    !!frame.returnError || !!frame.returnValue
      ? "TERMINATED [" +
        dumpValue(frame.returnValue) +
        ", " +
        dumpValue(frame.returnError) +
        "]\n"
      : ""
  }Stack: [${dumpValueStack(frame.stack)}]\n---`
}

function dumpCallStack(state: State, stack: CallStack): string {
  return stack.map((frame) => dumpFrame(state, frame)).join("\n")
}

export function dumpState(state: State): string {
  return `Heap:\n-----\n${dumpHeap(
    state.heap
  )}\n\nCallstack:\n-----\n${dumpCallStack(state, state.callStack)}`
}
