// Intermediate assembly language
import { Opcode, type AnyVal, Type } from "@workflowasm/protocols-js"

export class FunctionDefinition {
  semver: string
  name: string
  program?: ILProgram

  constructor(name: string, semver: string) {
    this.name = name
    this.semver = semver
  }
}

export enum ILOpcode {
  /** No operation */
  NOOP = 0,
  /** Verbatim WorkflowASM. arg1 = WFASM opcode, arg2 = numeric oparg */
  WFASM = 1,
  /** Push literal. arg1 = literal */
  PUSHLITERAL = 2,
  /** Push named function. arg1 = function specification */
  PUSHFN = 3,
  /** Label the next line of ASM */
  LABEL = 4,
  /** JMP to a label */
  GOTO = 5
}

export type ILFn = {
  name: string
  package: string
  semver: string
}

export type ILInstruction =
  | [ILOpcode.NOOP, null, null]
  | [ILOpcode.WFASM, Opcode, number]
  | [ILOpcode.PUSHLITERAL, AnyVal, null]
  | [ILOpcode.PUSHFN, ILFn, null]
  | [ILOpcode.LABEL, string, null]
  | [ILOpcode.GOTO, string, null]

export type ILProgram = ILInstruction[]

/** Convenience method for generating IL. */
export function il(...progs: ILProgram[]): ILProgram {
  return [...progs].flat()
}

export function printInstruction(instr: ILInstruction): string {
  switch (instr[0]) {
    case ILOpcode.NOOP:
      return "NOOP"
    case ILOpcode.WFASM:
      return `ASM [${Opcode[instr[1]]}, ${instr[2]}]`
    case ILOpcode.PUSHLITERAL:
      return `PUSHLITERAL ${Type[instr[1][0]]} ${String(instr[1][1])}`
    case ILOpcode.PUSHFN:
      return `PUSHFN ${instr[1].name} v'${instr[1].semver}' from '${instr[1].package}'`
    case ILOpcode.LABEL:
      return `   ${instr[1]}:`
    case ILOpcode.GOTO:
      return `GOTO ${instr[1]}`
  }
}

export function printIL(il: ILProgram): string {
  return il.map(printInstruction).join("\n")
}

function abs(n: bigint) {
  return n < 0 ? -n : n
}

export class ILCompiler {
  prog: ILProgram
  /** Map from already-seen constants to ktable entries */
  constantDedupe: Map<string | bigint | number, number> = new Map()
  /** ktable */
  constants: AnyVal[] = []
  /** Label jump map */
  labels: Map<string, number> = new Map()
  /** Assembly instructions */
  asm: Array<[opcode: Opcode, arg: number]> = []

  constructor(prog: ILProgram) {
    this.prog = prog
  }

  pushLiteral(literal: AnyVal) {
    const [type, val] = literal
    // Handle simple literals
    if (type === Type.NULL) {
      this.asm.push([Opcode.OP_PUSHNULL, 0])
      return
    } else if (type === Type.INT64 && abs(val) < Number.MAX_SAFE_INTEGER) {
      this.asm.push([Opcode.OP_PUSHINT, Number(val)])
      return
    }
    // Handle deduplicated literals
    if (
      type === Type.STRING ||
      type === Type.INT64 ||
      type === Type.UINT64 ||
      type === Type.DOUBLE
    ) {
      // Dedupe from existing table entry
      if (this.constantDedupe.has(val)) {
        this.asm.push([Opcode.OP_PUSHK, this.constantDedupe.get(val) as number])
        return
      } else {
        // register in table
        this.constantDedupe.set(val, this.constants.length)
        // fallthrough to general case
      }
    }
    // General case, add to constant table and PUSHK
    this.constants.push(literal)
    this.asm.push([Opcode.OP_PUSHK, this.constants.length - 1])
  }

  pushFn(fn: ILFn) {}

  compile() {
    for (const instr of this.prog) {
      switch (instr[0]) {
        case ILOpcode.NOOP:
          this.asm.push([Opcode.OP_NOOP, 0])
          break
        case ILOpcode.WFASM:
          this.asm.push([instr[1], instr[2]])
          break
        case ILOpcode.PUSHLITERAL:
          this.pushLiteral(instr[1])
          break
        case ILOpcode.PUSHFN:
          this.pushFn(instr[1])
          break
      }
    }
  }
}
