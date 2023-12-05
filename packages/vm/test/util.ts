import { Opcode, AnyValue, builtins, Config, NativeFunction, State } from ".."

export type FuncDef = {
  instructions: [Opcode, number][]
  constants: AnyValue[]
}
export type FuncMap = Record<string, FuncDef>

const localNativeFunctions: Record<string, NativeFunction> = {
  debug_push: {
    nativeFunctionSync(state, args) {}
  }
}

const nativeFunctions = Object.assign(
  {},
  builtins.nativeFunctions,
  localNativeFunctions
)

export function makeVm(code: FuncMap, mainArgs: AnyValue[] = []) {
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
      return code[functionPointer]?.instructions[instructionPointer]
    }

    override getConstant(
      functionPointer: string,
      constantPointer: number
    ): AnyValue | undefined {
      return code[functionPointer]?.constants[constantPointer]
    }
  }
  return new State(new TestConfig(), "main", mainArgs)
}
