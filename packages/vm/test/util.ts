import {
  Opcode,
  AnyValue,
  builtins,
  Config,
  NativeFunction,
  State,
  StatusCode,
  Null,
  RunningStatus,
  step,
  dumpState
} from ".."

class DebuggableState extends State {
  _traceValues: AnyValue[] = []
}

export type FuncDef = {
  instructions: [Opcode, number][]
  constants: AnyValue[]
}
export type FuncMap = Record<string, FuncDef>

const localNativeFunctions: Record<string, NativeFunction> = {
  trace_value: {
    nativeFunctionSync(state, args) {
      if (args.length !== 1) {
        return {
          error: state.makeError(
            StatusCode.INVALID_ARGUMENT,
            "requires 1 argument"
          )
        }
      }
      ;(state as DebuggableState)._traceValues.push(args[0])
      return { result: Null }
    }
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
      return nativeFunctions[functionPointer]
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
  return new DebuggableState(new TestConfig(), "main", mainArgs)
}

export function runVm(
  code: FuncMap,
  mainArgs: AnyValue[] = [],
  dump: boolean = false
) {
  const state = makeVm(code, mainArgs)
  if (dump) console.log(dumpState(state))
  while (state.getRunningStatus() === RunningStatus.RUN) {
    step(state)
    if (dump) console.log(dumpState(state))
  }
  return state
}
