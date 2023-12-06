import { FrameType, Opcode } from "@workflowasm/protocols-js"
import { type AnyValue, type NativeResult, type Heap, Null } from "./value.js"
import { Frame, type CallStack } from "./stack.js"
import { makeError, StatusCode } from "./error.js"

export { Opcode }

/**
 * Signature of native functions. Native functions MUST NOT re-enter the VM, as
 * they introduce non-serializable system state.
 */
export type NativeFunction =
  | {
      nativeFunctionSync: (state: State, args: AnyValue[]) => NativeResult
      nativeFunctionAsync?: undefined
    }
  | {
      nativeFunctionSync?: undefined
      nativeFunctionAsync: (
        state: State,
        args: AnyValue[]
      ) => Promise<NativeResult>
    }

/**
 * Abstract object that provides the VM with the necessary information
 * about the environment in which it is running. Subclass to customize the
 * VM's behavior for the environment.
 */
export class Config {
  /**
   * Maximum depth for the call stack.
   */
  maxCallStackDepth = 1024

  /**
   * Get the instruction at a given address.
   */
  getInstruction(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    functionPointer: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    instructionPointer: number
  ): [opcode: Opcode, oparg: number] | undefined {
    return undefined
  }

  /**
   * Get a constant from a function's constant table.
   */
  getConstant(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    functionPointer: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constantPointer: number
  ): AnyValue | undefined {
    return undefined
  }

  /**
   * Get a native function's definition
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getNativeFunction(functionPointer: string): NativeFunction | undefined {
    return undefined
  }

  /**
   * Called by the VM when an error would be swallowed and not propagated
   * up the call stack. (Example: during a deferred cleanup function)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onIgnoredError(state: State, error: AnyValue) {}

  /**
   * Called when the VM wants to resume the instruction loop after an async
   * process has returned.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onRequestResume(state: State) {}
}

export enum RunningStatus {
  RUN = 0,
  HALT = 1,
  ASYNC = 2,
  SUSPEND = 3
}

/**
 * VM state.
 */
export class State {
  /**
   * Garbage-collected heap indexed by `int32` ids. This can be directly
   * serialized to the state vector.
   */
  heap: Heap = new Map()

  /**
   * Call stack frames
   */
  callStack: CallStack = []

  /**
   * Configuration for the VM. Contains all source code as well as limiting
   * parameters.
   *
   * (Not serialized.)
   */
  _config: Config

  /**
   * Frame responsible for the current value stack. Updated automatically
   * as the call stack changes.
   *
   * (Not serialized.)
   */
  _stackFrame: Frame | undefined

  /**
   * Get the frame governing the current stack and instruction pointer.
   */
  _getStackFrame(): Frame | undefined {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      if (this.callStack[i].isControlFrame()) {
        return this.callStack[i]
      }
    }
    return undefined
  }

  getRunningStatus(): RunningStatus {
    const topFrame = this.callStack[this.callStack.length - 1]
    switch (topFrame.type) {
      case FrameType.UNKNOWN:
        return RunningStatus.HALT
      case FrameType.MAIN:
        if (!!topFrame.returnValue || !!topFrame.returnError) {
          return RunningStatus.HALT
        } else {
          return RunningStatus.RUN
        }
      case FrameType.CALL:
      case FrameType.TRY:
      case FrameType.IGNORE:
      case FrameType.PASSTHROUGH:
        return RunningStatus.RUN
    }
  }

  /**
   * Get the result (error or value) from a VM state that is halted.
   */
  getResult(): [value: AnyValue | undefined, error: AnyValue | undefined] {
    if (this.getRunningStatus() === RunningStatus.HALT) {
      return [this.callStack[0].returnValue, this.callStack[0].returnError]
    } else {
      throw new Error("getResult() called on a VM state that is still running")
    }
  }

  /**
   * Add a frame to the call stack.
   */
  pushFrame(frame: Frame): void {
    this.callStack.push(frame)
    if (frame.isControlFrame()) this._stackFrame = frame
  }

  /**
   * Remove the top frame from the call stack.
   */
  popFrame(): void {
    if (this.callStack.length <= 1) {
      throw new Error(
        `Fatal VM error: attempted to pop last frame from call stack.`
      )
    }

    // Pop the frame
    const poppedFrame = this.callStack.pop()
    if (poppedFrame === undefined) {
      // impossible
      return
    }

    // Locate the new control frame if needed
    if (poppedFrame === this._stackFrame) {
      this._stackFrame = this._getStackFrame()
    }

    // Handle returning data from the popped frame to the new control frame.
    switch (poppedFrame.type) {
      case FrameType.UNKNOWN:
        throw new Error("Fatal VM error: encountered UNKNOWN call stack frame")
      case FrameType.MAIN:
        throw new Error("Fatal VM error: do not pop the MAIN call stack frame")
      case FrameType.CALL:
        if (poppedFrame.returnError) {
          this.peekFrame().returnError = poppedFrame.returnError
        } else if (poppedFrame.returnValue) {
          this.push(poppedFrame.returnValue)
        }
        break
      case FrameType.TRY:
        if (poppedFrame.returnError) {
          this.push(Null)
          this.push(poppedFrame.returnError)
        } else if (poppedFrame.returnValue) {
          this.push(poppedFrame.returnValue)
          this.push(Null)
        }
        break
      case FrameType.IGNORE:
        if (poppedFrame.returnError) {
          this.onIgnoredError(poppedFrame.returnError)
        }
        break
      case FrameType.PASSTHROUGH:
        this.peekFrame().returnError = poppedFrame.returnError
        this.peekFrame().returnValue = poppedFrame.returnValue
        break
    }
  }

  /**
   * Examine the top frame of the call stack.
   */
  peekFrame(): Frame {
    return this.callStack[this.callStack.length - 1]
  }

  /**
   * Get the depth of the call stack.
   */
  callDepth(): number {
    return this.callStack.length
  }

  jmpRel(delta: number = 1) {
    if (this._stackFrame) this._stackFrame.ip += delta
  }

  jmpAbs(ip: number) {
    if (this._stackFrame) this._stackFrame.ip = ip
  }

  /**
   * Push a value to the value stack.
   */
  push(value: AnyValue): void {
    this._stackFrame?.stack?.push(value)
  }

  /**
   * Pop the top value from the value stack.
   */
  pop(): AnyValue | undefined {
    return this._stackFrame?.stack?.pop()
  }

  /**
   * Pop returning `Null` if stack is empty.
   */
  pops(): AnyValue {
    const x = this._stackFrame?.stack?.pop()
    return x ? x : Null
  }

  /**
   * Pop `n` stack entries, returning `undefined` if `depth` < `n`.
   */
  popn(n: number): AnyValue[] | undefined {
    if (n === 0) return []
    const stack = this._stackFrame?.stack
    if (!stack || stack.length < n) return undefined
    return stack.splice(stack.length - n, n)
  }

  /**
   * Get a value at the given stack position. Negative indices measure
   * down from the top of the stack.
   */
  at(index: number): AnyValue | undefined {
    const stack = this._stackFrame?.stack
    if (stack === undefined || stack.length === 0) return undefined
    if (Math.abs(index) >= stack.length) return undefined
    return stack[index - 1 + (index <= 0 ? stack.length : 0)]
  }

  /**
   * Get the depth of the value stack.
   */
  depth(): number {
    const stack = this._stackFrame?.stack
    if (stack === undefined) return 0
    return stack.length
  }

  /**
   * Invoked when an error is thrown in a context where it cannot be propagated
   * and caught. Example is when a deferred cleanup function throws an
   * error.
   */
  onIgnoredError(_err: AnyValue): void {}

  /**
   * Make an error with a stack trace.
   */
  makeError(code: StatusCode, message: string): AnyValue {
    return makeError(code, message)
  }

  /**
   * Make and throw an error at the running frame.
   */
  throwError(codeOrError: StatusCode | AnyValue, message?: string): void {
    if (message !== undefined) {
      codeOrError = this.makeError(codeOrError as StatusCode, message)
    }
    this.peekFrame().throwError(codeOrError as AnyValue)
  }

  /**
   * Construct a new State, beginning at the given main function.
   */
  constructor(config: Config, mainFnName: string, mainArgs: AnyValue[]) {
    this._config = config

    // Call the main() function and put it on the stack
    const mainFrame = new Frame()
    mainFrame.type = FrameType.MAIN
    mainFrame.stack = mainArgs
    mainFrame.fp = mainFnName
    mainFrame.ip = 0
    this.pushFrame(mainFrame)
  }
}
