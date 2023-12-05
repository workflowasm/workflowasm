import { State } from "./state.js"
import { parseCall, callInternal } from "./function.js"
import { FrameType } from "./stack.js"
import { StatusCode } from "./error.js"
import { Binop, Opcode, Unop } from "@workflowasm/protocols-js"
import { Null, Type, toBoolean } from "./value.js"
import { binop, unop } from "./builtins.js"

/**
 * Step the virtual machine.
 */
export function step(state: State): void {
  const topFrame = state.peekFrame()

  // Cleanup and return
  if (topFrame.isTerminated()) {
    // Clean up locals, unshift defers if needed
    // TODO: implement

    // Call each deferred
    const deferred = topFrame.deferred?.pop()
    if (deferred !== undefined) {
      return callInternal(state, FrameType.IGNORE, deferred, [])
    }

    // Shouldn't get here if main frame
    if (topFrame.type === FrameType.MAIN) {
      throw new Error("`vm_step` called on a terminated main frame")
    }

    // Pop the terminated frame, resuming processing at the next instruction
    // of the containing frame
    state.popFrame()

    // Treat this as a machine step so the debugger sees the stack push from
    // the return.
    return
  }

  // Fetch instruction
  const inst = state._config.getInstruction(
    state._stackFrame?.fp ?? "",
    state._stackFrame?.ip ?? 0
  )

  // Instruction pointer out-of-range, throw
  if (inst === undefined) {
    state.throwError(
      StatusCode.OUT_OF_RANGE,
      "instruction pointer out of range"
    )
    return
  }

  const [opcode, oparg] = inst

  // Execute
  switch (opcode) {
    case Opcode.OP_NOOP:
      break

    case Opcode.OP_PUSHNULL:
      state.push(Null)
      break

    case Opcode.OP_PUSHINT:
      state.push([Type.INT64, BigInt(oparg)])
      break

    case Opcode.OP_PUSHDEPTH:
      state.push([Type.INT64, BigInt(state.depth())])
      break

    case Opcode.OP_PUSHK: {
      const val = state._config.getConstant(state._stackFrame?.fp ?? "", oparg)
      if (val === undefined) {
        return state.throwError(
          StatusCode.OUT_OF_RANGE,
          `constant index ${oparg} out of range`
        )
      }
      state.push(val)
      break
    }

    case Opcode.OP_DUP: {
      const val = state.at(oparg)
      if (val === undefined) {
        state.throwError(
          StatusCode.OUT_OF_RANGE,
          `stack index ${oparg} out of range`
        )
        return
      }
      state.push(val)
      break
    }

    case Opcode.OP_POP: {
      const ret = state.popn(oparg)
      if (ret === undefined) {
        state.throwError(
          StatusCode.OUT_OF_RANGE,
          `stack has length ${state.depth()}, cannot pop ${oparg} elements`
        )
        return
      }
      break
    }

    case Opcode.OP_TEST: {
      const val = state.pop()
      if (val === undefined) {
        return state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `too few arguments`
        )
      }
      // Take the main branch if `boolean(val) == i1`
      if (toBoolean(val) === (oparg === 0)) {
        // jump branch
        state.jmpRel(1)
        return
      } else {
        // main branch
        state.jmpRel(2)
        return
      }
    }

    case Opcode.OP_JMP:
      // TODO: bounds check the JMP
      state.jmpAbs(oparg)
      return

    case Opcode.OP_CALL: {
      if (state.callDepth() > state._config.maxCallStackDepth) {
        state.throwError(StatusCode.INTERNAL, "Call stack overflow.")
        return
      }

      // Get the args
      const [ok, fn, args] = parseCall(state)
      if (!ok) return

      // Advance IP past the call instruction so we pick up where
      // we left off upon return.
      state.jmpRel(1)

      // Make the call
      return callInternal(state, FrameType.CALL, fn, args)
    }

    case Opcode.OP_RETURN: {
      const val = state.pop()
      if (val === undefined) {
        state.throwError(StatusCode.INVALID_ARGUMENT, `too few arguments`)
        return
      }

      state.peekFrame().returnValue = val
      return
    }

    case Opcode.OP_THROW: {
      const val = state.pop()
      if (val === undefined) {
        return state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `too few arguments`
        )
      }

      state.peekFrame().returnError = val
      return
    }

    case Opcode.OP_UNOP: {
      const val = state.pop()
      if (val === undefined) {
        return state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `too few arguments`
        )
      }
      const result = unop(state, oparg as Unop, val)
      if (result === undefined) return
      state.push(result)
      break
    }

    case Opcode.OP_BINOP: {
      const arg2 = state.pop()
      const arg1 = state.pop()
      if (arg1 === undefined || arg2 === undefined) {
        return state.throwError(
          StatusCode.INVALID_ARGUMENT,
          `too few arguments`
        )
      }
      const result = binop(state, oparg as Binop, arg1, arg2)
      if (result === undefined) return
      state.push(result)
      break
    }

    case Opcode.OP_PUSHINDEX:
    case Opcode.OP_PUSHENV:
    case Opcode.OP_ROLL:
    case Opcode.OP_SETENV:
    case Opcode.OP_CLEARENV:
    case Opcode.OP_CHECKENV:
    case Opcode.OP_CHECKINDEX:
    case Opcode.OP_NEWMESSAGE:
    case Opcode.OP_NEWMAP:
    case Opcode.OP_NEWLIST:
    case Opcode.OP_NEWCLOSURE:
    case Opcode.OP_CHECKPOINT:
    case Opcode.OP_ACTION:
      return state.throwError(
        StatusCode.UNIMPLEMENTED,
        `Opcode ${Opcode[opcode]} is not yet implemented`
      )
  }

  // Standard advance of ip by 1 instruction
  state.jmpRel(1)
  return
}
