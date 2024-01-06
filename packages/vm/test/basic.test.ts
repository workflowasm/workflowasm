import { Opcode, Type, CallableType, Null } from ".."
import { getErrorMessage, runVm } from "./util"

test("main empty", function () {
  const state = runVm({
    main: {
      instructions: [],
      constants: []
    }
  })
  expect(getErrorMessage(state.getResult())).toBe(
    "instruction pointer out of range"
  )
})

test("main return", function () {
  const state = runVm({
    main: {
      instructions: [
        [Opcode.OP_PUSHINT, 31337],
        [Opcode.OP_RETURN, 0]
      ],
      constants: []
    }
  })
  expect(state.getResult()).toEqual([[Type.INT64, BigInt(31337)], undefined])
})

test("main throw", function () {
  const state = runVm({
    main: {
      instructions: [
        [Opcode.OP_PUSHNULL, 0],
        [Opcode.OP_THROW, 0]
      ],
      constants: []
    }
  })
  expect(state.getResult()).toEqual([undefined, [Type.NULL, null]])
})

test("call return", function () {
  const state = runVm({
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
        [Opcode.OP_PUSHINT, 31337],
        [Opcode.OP_RETURN, 0]
      ],
      constants: []
    }
  })
  expect(state.getResult()).toEqual([[Type.INT64, BigInt(31337)], undefined])
})

test("call throw", function () {
  const state = runVm({
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
        [Opcode.OP_PUSHNULL, 0],
        [Opcode.OP_THROW, 0]
      ],
      constants: []
    }
  })
  expect(state.getResult()).toEqual([undefined, [Type.NULL, null]])
})

test("call throw depth 2", function () {
  const state = runVm({
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
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_PUSHK, 0],
        [Opcode.OP_CALL, 0],
        [Opcode.OP_RETURN, 0]
      ],
      constants: [[Type.CALLABLE, { type: CallableType.FUNCTION, id: "f2" }]]
    },
    f2: {
      instructions: [
        [Opcode.OP_PUSHNULL, 0],
        [Opcode.OP_THROW, 0]
      ],
      constants: []
    }
  })
  expect(state.getResult()).toEqual([undefined, Null])
})

test("if then truthy", function () {
  const state = runVm({
    main: {
      instructions: [
        [Opcode.OP_PUSHINT, 1],
        [Opcode.OP_TEST, 1],
        [Opcode.OP_JMP, 7],
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_PUSHK, 0],
        [Opcode.OP_CALL, 0],
        [Opcode.OP_RETURN, 0],
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_PUSHK, 1],
        [Opcode.OP_CALL, 0],
        [Opcode.OP_RETURN, 0]
      ],
      constants: [
        [Type.CALLABLE, { type: CallableType.FUNCTION, id: "truthy" }],
        [Type.CALLABLE, { type: CallableType.FUNCTION, id: "falsy" }]
      ]
    },
    truthy: {
      instructions: [
        [Opcode.OP_PUSHINT, 1],
        [Opcode.OP_RETURN, 0]
      ],
      constants: []
    },
    falsy: {
      instructions: [
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_RETURN, 0]
      ],
      constants: []
    }
  })
  expect(state.getResult()).toEqual([[Type.INT64, 1n], undefined])
})

test("if then falsy", function () {
  const state = runVm({
    main: {
      instructions: [
        [Opcode.OP_PUSHNULL, 0],
        [Opcode.OP_TEST, 1],
        [Opcode.OP_JMP, 7],
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_PUSHK, 0],
        [Opcode.OP_CALL, 0],
        [Opcode.OP_RETURN, 0],
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_PUSHK, 1],
        [Opcode.OP_CALL, 0],
        [Opcode.OP_RETURN, 0]
      ],
      constants: [
        [Type.CALLABLE, { type: CallableType.FUNCTION, id: "truthy" }],
        [Type.CALLABLE, { type: CallableType.FUNCTION, id: "falsy" }]
      ]
    },
    truthy: {
      instructions: [
        [Opcode.OP_PUSHINT, 1],
        [Opcode.OP_RETURN, 0]
      ],
      constants: []
    },
    falsy: {
      instructions: [
        [Opcode.OP_PUSHINT, 0],
        [Opcode.OP_RETURN, 0]
      ],
      constants: []
    }
  })
  expect(state.getResult()).toEqual([[Type.INT64, 0n], undefined])
})
