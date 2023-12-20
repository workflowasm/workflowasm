// Code related to calling functions

import { State } from "./state.js"
import { Frame, FrameType } from "./stack.js"
import {
  type AnyValue,
  CallableType,
  type CallableValue,
  type ClosureCallable,
  type FunctionCallable,
  Null,
  Type,
  toU32
} from "./value.js"
import { StatusCode } from "./error.js"

/**
 * Helper to process args for a `CALL` opcode. Number of args must be
 * at the top of the stack, followed by the args in LIFO order.
 */
export function parseCall(
  state: State
):
  | [ok: false, fn: undefined, args: undefined]
  | [ok: true, fn: CallableValue, args: AnyValue[]] {
  // get the fn
  if (state.depth() < 2) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `parseCall: too few arguments, expected at least 2`
    )
    return [false, undefined, undefined]
  }

  // Get the function
  const fn = state.pops()
  if (fn[0] !== Type.CALLABLE) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `parseCall: first argument to a CALL must be a function`
    )
    return [false, undefined, undefined]
  }

  // Get the arg count
  const nargs = toU32(state.pops())
  if (nargs === undefined) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `parseCall: expected an integer number of arguments`
    )
    return [false, undefined, undefined]
  }

  // Get the args
  const args = state.popn(nargs)
  if (args === undefined) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `decodeCallArgs: expected ${nargs} args, got ${state.depth()}`
    )
    return [false, undefined, undefined]
  }

  return [true, fn[1], args]
}

function createCallFrame(
  fn: FunctionCallable | ClosureCallable,
  args: AnyValue[]
): Frame {
  const boundArgs = fn.type === CallableType.CLOSURE ? fn.boundArgs : undefined
  const frame = new Frame()
  frame.stack = boundArgs ? args.concat(boundArgs) : args
  frame.fp = fn.id
  frame.ip = 0
  return frame
}

/**
 * Handle errors coming from a synchronous native function.
 */
function nativeResponse(
  state: State,
  frameType: FrameType,
  result?: AnyValue,
  error?: AnyValue
): void {
  if (result !== undefined) {
    switch (frameType) {
      case FrameType.IGNORE:
      case FrameType.UNKNOWN:
        return

      case FrameType.MAIN:
      case FrameType.CALL:
      case FrameType.TRY:
      case FrameType.PASSTHROUGH:
        return state.push(result)
    }
  } else if (error !== undefined) {
    switch (frameType) {
      case FrameType.IGNORE:
        return state.onIgnoredError(error)

      case FrameType.UNKNOWN:
        return

      case FrameType.TRY:
        state.push(Null)
        return state.push(error)

      case FrameType.MAIN:
      case FrameType.CALL:
      case FrameType.PASSTHROUGH:
        return state.throwError(error)
    }
  } else {
    return
  }
}

export function callInternal(
  state: State,
  frameType: FrameType,
  callable: CallableValue,
  args: AnyValue[]
) {
  switch (callable.type) {
    case CallableType.NATIVE: {
      const nativeFn = state._config.getNativeFunction(callable.id)
      if (nativeFn === undefined) {
        return nativeResponse(
          state,
          frameType,
          undefined,
          state.makeError(
            StatusCode.INTERNAL,
            `Invalid native function id ${callable.id}`
          )
        )
      } else if (nativeFn.nativeFunctionSync) {
        try {
          const result = nativeFn.nativeFunctionSync(state, args)
          return nativeResponse(state, frameType, result.result, result.error)
        } catch (err) {
          return nativeResponse(
            state,
            frameType,
            undefined,
            state.makeError(
              StatusCode.INTERNAL,
              "Implementation of native function threw a native exception. This indicates a bug in the implementation of the native function."
            )
          )
        }
      } else {
        // async
        return nativeResponse(
          state,
          frameType,
          undefined,
          state.makeError(
            StatusCode.UNIMPLEMENTED,
            "async native functions are not yet implemented"
          )
        )
      }
    }
    case CallableType.FUNCTION:
    case CallableType.CLOSURE: {
      const frame = createCallFrame(callable, args)
      frame.type = frameType
      state.pushFrame(frame)
      return
    }
  }
}
