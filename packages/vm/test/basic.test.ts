import {
  State,
  Config,
  builtins,
  type NativeFunction,
  AnyValue,
  Opcode,
  dumpState,
  step,
  RunningStatus,
  Type,
  CallableType,
  Binop
} from ".."

type FuncDef = { instructions: [Opcode, number][]; constants: AnyValue[] }

const functions: { [k: string]: FuncDef } = {
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
      [Opcode.OP_RETURN, 0]
    ],
    constants: []
  }
}

class TestConfig extends Config {
  override getNativeFunction(
    functionPointer: string
  ): NativeFunction | undefined {
    return builtins.nativeFunctions[functionPointer]
  }

  override getInstruction(
    functionPointer: string,
    instructionPointer: number
  ): [opcode: Opcode, oparg: number] | undefined {
    return functions[functionPointer]?.instructions[instructionPointer]
  }

  override getConstant(
    functionPointer: string,
    constantPointer: number
  ): AnyValue | undefined {
    return functions[functionPointer]?.constants[constantPointer]
  }
}

test("should work", function () {
  const state = new State(new TestConfig(), "main", [])
  console.log(dumpState(state))
  while (state.getRunningStatus() === RunningStatus.RUN) {
    step(state)
    console.log(dumpState(state))
  }
})
