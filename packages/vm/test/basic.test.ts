import {
  Opcode,
  dumpState,
  step,
  RunningStatus,
  Type,
  CallableType,
  Binop
} from ".."
import { makeVm } from "./util"

test("should work", function () {
  const state = makeVm({
    main: {
      instructions: [
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_PUSHK, 0],
        [Opcode.OP_CALL, 0],
        [Opcode.OP_RETURN, 0]
      ],
      constants: [[Type.CALLABLE, { type: CallableType.FUNCTION, id: "f1" }]]
    },
    f1: {
      instructions: [
        [Opcode.OP_PUSHINT, 1],
        [Opcode.OP_PUSHINT, 2],
        [Opcode.OP_BINOP, Binop.ADD],
        [Opcode.OP_DUP, 0],
        [Opcode.OP_PUSHINT, 1],
        [Opcode.OP_PUSHK, 0],
        [Opcode.OP_CALL, 0],
        [Opcode.OP_POP, 1],
        [Opcode.OP_RETURN, 0]
      ],
      constants: [
        [Type.CALLABLE, { type: CallableType.NATIVE, id: "trace_value" }]
      ]
    }
  })

  console.log(dumpState(state))
  while (state.getRunningStatus() === RunningStatus.RUN) {
    step(state)
    console.log(dumpState(state))
  }
  expect(state._traceValues).toEqual([[Type.INT64, BigInt(3)]])
  expect(state.getResult()).toEqual([[Type.INT64, BigInt(3)], undefined])
})
