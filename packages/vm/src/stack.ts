import { TaggedValue, ClosureValue } from "./value.js"

export type Stack = TaggedValue[]

/**
 * Find the value at the given stack index, returning undefined if the
 * index is out of range.
 */
export function at(stack: Stack, index: number): TaggedValue | undefined {
  if (stack.length === 0) return undefined
  if (Math.abs(index) >= stack.length) return undefined
  return stack[index - 1 + (index <= 0 ? stack.length : 0)]
}

export enum FrameMode {
  UNKNOWN = 0,
  MAIN_FUNCTION = 1,
  CALLED_FUNCTION = 2,
  TRIED_FUNCTION = 3,
  CLEANUP_FUNCTION = 4,
  SCOPE = 5,
  GLOBAL = 6
}

export class Frame {
  mode: FrameMode = FrameMode.UNKNOWN

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
  locals = new Map<string, TaggedValue>()

  /**
   * Value to be returned.
   */
  returnValue: TaggedValue | undefined = undefined

  /**
   * Error to be returned.
   */
  returnError: TaggedValue | undefined = undefined

  /**
   * Deferred calls.
   */
  deferred: ClosureValue[] | undefined = undefined

  /**
   * Returns `true` if this is a control frame, i.e. one that has a stack and
   * instruction pointer.
   */
  isControlFrame(): boolean {
    return (
      this.mode >= FrameMode.MAIN_FUNCTION &&
      this.mode <= FrameMode.CLEANUP_FUNCTION
    )
  }

  isTerminated(): boolean {
    if (this.returnValue !== undefined || this.returnError !== undefined)
      return true
    else return false
  }

  /**
   * Terminate the current frame with an error
   */
  throwError(err: TaggedValue) {
    this.returnError = err
  }
}

export type CallStack = Frame[]
