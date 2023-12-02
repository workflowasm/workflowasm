import { Opcode, Binop, Unop } from "@workflowasm/protocols-js"
import { Code } from "./code.js"
import {
  TaggedValue,
  TypeTag,
  integralToU32,
  toBoolean,
  Heap,
  ClosureValue,
  Null
} from "./value.js"
import { Stack, at, Frame, CallStack, FrameMode } from "./stack.js"
import { makeError, StatusCode } from "./error.js"

enum RunningStatus {
  RUN = 0,
  HALT = 1,
  SUSPEND = 2,
  YIELD = 3
}

/**
 * VM state.
 */
export class State {
  /**
   * Running status of the VM
   */
  running: RunningStatus = RunningStatus.RUN

  /**
   * Garbage-collected heap indexed by `int32` ids. This can be directly
   * serialized to the state vector.
   */
  heap: Heap = new Map()

  /**
   * Code base for the VM. (All callable functions must be synchronously
   * resolvable during the execution run of the VM.)
   */
  code: Code

  /**
   * Call stack frames
   */
  callStack: CallStack = []

  /**
   * Get the frame governing the current stack and instruction pointer.
   */
  getControlFrame(): Frame | undefined {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (this.callStack[i].isControlFrame()) {
        return this.callStack[i]
      }
    }
    return undefined
  }

  /**
   * Add a frame to the call stack.
   */
  pushFrame(frame: Frame): void {
    this.callStack.push(frame)
  }

  /**
   * Remove the top frame from the call stack.
   */
  popFrame(): void {
    this.callStack.pop()
  }

  /**
   * Examine the top frame of the call stack.
   */
  peekFrame(): Frame {
    return this.callStack[this.callStack.length - 1]
  }

  /**
   * Invoked when an error is thrown in a context where it cannot be propagated
   * and caught. Example is when a deferred cleanup function throws an
   * error.
   */
  hiddenError(_err: TaggedValue): void {}

  /**
   * Make an error with a stack trace.
   */
  makeError(code: StatusCode, message: string): TaggedValue {
    return makeError(code, message)
  }

  /**
   * Make and throw an error at the running frame.
   */
  throwError(code: StatusCode, message: string): void {
    const err = this.makeError(code, message)
    this.peekFrame().throwError(err)
  }

  constructor(code: Code) {
    this.code = code
  }
}

/**
 * Helper to process args for a `CALL` opcode. Number of args must be
 * at the top of the stack, followed by the args in LIFO order.
 */
function decodeCallArgs(
  state: State,
  stack: Stack
):
  | [ok: false, fn: undefined, args: undefined]
  | [ok: true, fn: ClosureValue, args: TaggedValue[]] {
  // get the fn
  if (stack.length < 2) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `decodeCallArgs: too few arguments, expected at least 2`
    )
    return [false, undefined, undefined]
  }

  // Get the function
  const fn = stack.pop() as TaggedValue
  if (fn[0] !== TypeTag.TYPE_CLOSURE) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `decodeCallArgs: first argument to a CALL must be a function`
    )
    return [false, undefined, undefined]
  }

  // Get the arg count
  const nargs = integralToU32(stack.pop() as TaggedValue)
  if (nargs === undefined) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `decodeCallArgs: expected an integer number of arguments`
    )
    return [false, undefined, undefined]
  }

  if (nargs === 0) return [true, fn[1], []]

  // Get the args
  if (stack.length < nargs) {
    state.throwError(
      StatusCode.INVALID_ARGUMENT,
      `decodeCallArgs: expected ${nargs} args, got ${stack.length}`
    )
    return [false, undefined, undefined]
  }
  const args = stack.splice(stack.length - nargs, nargs)

  return [true, fn[1], args]
}

function createCallFrame(
  fn: ClosureValue,
  args: TaggedValue[] | undefined
): Frame {
  const frame = new Frame()
  frame.stack =
    args && fn[1] ? args.concat(fn[1]) : args ? args : fn[1] ? fn[1] : []
  frame.fp = fn[0]
  frame.ip = 0
  return frame
}

/**
 * Step the virtual machine.
 */
function vm_step(state: State): void {
  const controlFrame = state.getControlFrame()
  if (controlFrame === undefined) {
    // This state is closed.
    throw new Error("`vm_step` called on a stopped state.")
  }
  const stack = controlFrame.stack as Stack
  const topFrame = state.peekFrame()

  // Cleanup and return
  if (topFrame.isTerminated()) {
    // Clean up locals, unshift defers if needed
    // TODO: implement

    // Call one deferred
    const deferred = topFrame.deferred?.pop()
    if (deferred !== undefined) {
      const frame = createCallFrame(deferred, undefined)
      frame.mode = FrameMode.CLEANUP_FUNCTION
      state.pushFrame(frame)
      return
    }

    // Handle return value
    if (
      state.callStack.length === 1 ||
      topFrame.mode === FrameMode.MAIN_FUNCTION
    ) {
      // Returning from last frame or main function. Halt state
      state.running = RunningStatus.HALT
      return
    }

    if (topFrame.mode === FrameMode.SCOPE) {
      // When a scope is popped, just propagate return value
      state.popFrame()
      state.peekFrame().returnError = topFrame.returnError
      state.peekFrame().returnValue = topFrame.returnValue
    } else if (topFrame.mode === FrameMode.CLEANUP_FUNCTION) {
      // Return values of cleanup functions are ignored.
      // If a cleanup function would trigger an error, it is reported
      // to the state machine as an error that would otherwise be swallowed.
      if (topFrame.returnError) {
        state.hiddenError(topFrame.returnError)
      }
      state.popFrame()
    } else if (topFrame.mode === FrameMode.CALLED_FUNCTION) {
      // A called function pushes its return value to the parent stack, but
      // if there was an error, it is propagated.
      state.popFrame()
      if (topFrame.returnError) {
        state.peekFrame().returnError = topFrame.returnError
      } else if (topFrame.returnValue) {
        const stackFrame = state.getControlFrame()
        stackFrame?.stack?.push(topFrame.returnValue)
      } else {
        throw new Error(
          "invalid VM state: returning from a called function without a value or error"
        )
      }
    } else if (topFrame.mode === FrameMode.TRIED_FUNCTION) {
      // A tried function pushes (return value, null) or (null, error value) to
      // the parent stack.
      state.popFrame()
      const stackFrame = state.getControlFrame()
      if (topFrame.returnError) {
        stackFrame?.stack?.push(Null)
        stackFrame?.stack?.push(topFrame.returnError)
      } else if (topFrame.returnValue) {
        stackFrame?.stack?.push(topFrame.returnValue)
        stackFrame?.stack?.push(Null)
      } else {
        throw new Error(
          "invalid VM state: returning from a tried function without a value or error"
        )
      }
    }
  }

  // Fetch instruction
  const inst = state.code.getInstruction(controlFrame.fp, controlFrame.ip)

  // Instruction pointer out-of-range, throw
  if (inst === undefined) {
    state.throwError(
      StatusCode.OUT_OF_RANGE,
      "instruction pointer out of range"
    )
    return
  }

  const { opcode, i1: oparg } = inst

  // Execute
  switch (opcode) {
    case Opcode.OP_NOOP:
      break

    case Opcode.OP_PUSHNULL:
      stack.push([TypeTag.TYPE_NULL, null])
      break

    case Opcode.OP_PUSHINT:
      stack.push([TypeTag.TYPE_INT64, BigInt(oparg)])
      break

    case Opcode.OP_PUSHDEPTH:
      stack.push([TypeTag.TYPE_INT64, BigInt(stack.length)])
      break

    case Opcode.OP_PUSHK: {
      const val = state.code.getConstant(controlFrame.fp, oparg)
      if (val === undefined) {
        state.throwError(
          StatusCode.OUT_OF_RANGE,
          `constant index ${oparg} out of range`
        )
        return
      }
      stack.push(val)
      break
    }

    case Opcode.OP_DUP: {
      const val = at(stack, oparg)
      if (val === undefined) {
        state.throwError(
          StatusCode.OUT_OF_RANGE,
          `stack index ${oparg} out of range`
        )
        return
      }
      stack.push(val)
      break
    }

    case Opcode.OP_POP: {
      if (stack.length === 0 || stack.length < oparg) {
        state.throwError(
          StatusCode.OUT_OF_RANGE,
          `stack has length ${stack.length}, cannot pop ${oparg} elements`
        )
        return
      }
      const n = Math.min(oparg, 1)
      stack.splice(stack.length - n, n)
      break
    }

    case Opcode.OP_ROLL: {
      if (stack.length < oparg || oparg < 2) {
        state.throwError(
          StatusCode.OUT_OF_RANGE,
          `roll of ${oparg} impossible on a stack of length ${stack.length}`
        )
        return
      }
      const [val] = stack.splice(stack.length - oparg, 1)
      stack.push(val)
      break
    }

    case Opcode.OP_TEST: {
      if (stack.length < 1) {
        state.throwError(StatusCode.INVALID_ARGUMENT, `too few arguments`)
      }
      const val = stack.pop() as TaggedValue
      // Take the main branch if `boolean(val) == i1`
      if (toBoolean(val) === (oparg === 0)) {
        controlFrame.ip = controlFrame.ip + 1
        return
      } else {
        controlFrame.ip = controlFrame.ip + 2
        return
      }
    }

    case Opcode.OP_JMP:
      // TODO: bounds check the JMP
      controlFrame.ip = oparg
      return

    case Opcode.OP_CALL: {
      // TODO: check for callstack overflow

      // Get the args
      const [ok, fn, args] = decodeCallArgs(state, stack)
      if (!ok) return

      // Make the new frame
      const frame = createCallFrame(fn, args)
      frame.mode =
        oparg === 1 ? FrameMode.TRIED_FUNCTION : FrameMode.CALLED_FUNCTION
      state.callStack.push(frame)

      // Advance IP past the call instruction so we pick up where
      // we left off upon return.
      controlFrame.ip = controlFrame.ip + 1
      return
    }

    case Opcode.OP_RETURN: {
      if (stack.length < 1) {
        state.throwError(StatusCode.INVALID_ARGUMENT, `too few arguments`)
        return
      }

      // Mark the current frame as returning
      const val = stack.pop() as TaggedValue
      topFrame.returnValue = val
      return
    }

    case Opcode.OP_THROW: {
      if (stack.length < 1) {
        state.throwError(StatusCode.INVALID_ARGUMENT, `too few arguments`)
        return
      }

      // Mark the current frame as returning
      const val = stack.pop() as TaggedValue
      topFrame.returnError = val
      return
    }

    case Opcode.OP_UNOP: {
      if (stack.length < 1) {
        state.throwError(StatusCode.INVALID_ARGUMENT, `too few arguments`)
        return
      }
      const result = evaluateUnop(
        state,
        oparg as Unop,
        stack.pop() as TaggedValue
      )
      if (result === undefined) return
      stack.push(result)
    }
  }

  // Standard advance of ip by 1 instruction
  controlFrame.ip = controlFrame.ip + 1
  return
}

function evaluateUnop(
  state: State,
  unop: Unop,
  arg: TaggedValue
): TaggedValue | undefined {
  const [type, value] = arg
  switch (unop) {
    case Unop.MINUS:
      switch (type) {
        case TypeTag.TYPE_INT64:
          return [TypeTag.TYPE_INT64, -value]
        case TypeTag.TYPE_DOUBLE:
          return [TypeTag.TYPE_DOUBLE, -value]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `UNOP_MINUS: invalid argument, expected int or double`
          )
          return undefined
      }

    case Unop.NOT:
      switch (type) {
        case TypeTag.TYPE_NULL:
          return [TypeTag.TYPE_BOOLEAN, true]
        case TypeTag.TYPE_BOOLEAN:
          return [TypeTag.TYPE_BOOLEAN, !value]
        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `UNOP_NOT: invalid argument, expected boolean or null`
          )
          return undefined
      }

    case Unop.LEN:
      switch (type) {
        case TypeTag.TYPE_STRING:
        case TypeTag.TYPE_LIST:
        case TypeTag.TYPE_BYTES:
          return [TypeTag.TYPE_INT64, BigInt(value.length)]

        case TypeTag.TYPE_MAP:
          return [TypeTag.TYPE_INT64, BigInt(value.size)]

        default:
          state.throwError(
            StatusCode.INVALID_ARGUMENT,
            `UNOP_LEN: invalid argument, expected string, list, bytes, or map`
          )
          return undefined
      }
  }
}
