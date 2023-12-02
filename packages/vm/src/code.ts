import { Instruction, Opcode } from "@workflowasm/protocols-js"
import { TaggedValue } from "./value.js"

export class Code {
  /**
   * Get the instruction at a given address.
   */
  getInstruction(
    _functionPointer: string,
    _instructionPointer: number
  ): Instruction | undefined {
    return new Instruction({ opcode: Opcode.OP_NOOP })
  }

  getConstant(
    _functionPointer: string,
    _constantPointer: number
  ): TaggedValue | undefined {
    return undefined
  }
}
