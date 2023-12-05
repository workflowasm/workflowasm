import { type AnyValue, type CallableValue } from "./value.js"
import { FrameType } from "@workflowasm/protocols-js"

export { FrameType }

export type Stack = AnyValue[]

/**
 * A stack frame on the call stack of the VM state.
 */
export class Frame {
  /**
   * Frame type. Indicates how return values and cleanup should be handled
   * as this frame is popped from the call stack.
   */
  type: FrameType = FrameType.UNKNOWN

  /**
   * Current working stack. The end of the array is the top of the stack.
   */
  stack: Stack | undefined = undefined

  /**
   * Function pointer. Refers to the internal name of the function body being executed.
   */
  fp: string = ""

  /**
   * Instruction pointer. Indicates the next instruction to be executed
   * within the function indicated by the fp.
   */
  ip: number = 0

  /**
   * Local variables
   */
  locals = new Map<string, AnyValue>()

  /**
   * Value to be returned.
   */
  returnValue: AnyValue | undefined = undefined

  /**
   * Error to be returned.
   */
  returnError: AnyValue | undefined = undefined

  /**
   * Deferred calls.
   */
  deferred: CallableValue[] | undefined = undefined

  /**
   * Returns `true` if this is a control frame, i.e. one that has a stack and
   * instruction pointer.
   */
  isControlFrame(): boolean {
    return !!this.stack
  }

  /**
   * Returns `true` if this frame's execution has terminated in either an
   * error or successful return state.
   */
  isTerminated(): boolean {
    if (this.returnValue !== undefined || this.returnError !== undefined)
      return true
    else return false
  }

  /**
   * Terminate the current frame with an error
   */
  throwError(err: AnyValue) {
    this.returnError = err
  }
}

export type CallStack = Frame[]
