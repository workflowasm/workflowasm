import { ScopeVisitor, TypedScopedPath, type Scope } from "../scope.js"
import { FunctionDefinition, type ILProgram, dumpIL } from "../il.js"
import { Visitor, createRootPath } from "../../ast/traverse.js"
import * as T from "../../ast/types.js"
import { type SourceCode } from "../../types.js"
import { ObjectFile, dumpAsm } from "@workflowasm/protocols-js"
import { ReferenceVisitor } from "../reference.js"

export class TypedCompilerPath<PathT> extends TypedScopedPath<PathT> {
  /** Tightest enclosing function definition around this path. */
  func?: FunctionDefinition
  /** Compiled IL program associated to the node at this path. */
  il?: ILProgram
  // Scope for all paths is set by the ScopeVisitor; assert its
  // non-nullity here.
  declare scope: Scope
}

export type CompilerPath = TypedCompilerPath<CompilerPath>

export class BaseCompiler extends Visitor<CompilerPath> {
  /** The parsed input program */
  program: T.Program

  /** The source code (used for error framing) */
  source?: SourceCode

  /** The package definition */
  package?: string

  /** Collected function definitions */
  // eslint-disable-next-line @typescript-eslint/ban-types
  functions: { [name: string]: FunctionDefinition } = {}

  constructor(program: T.Program, source?: SourceCode) {
    super()
    this.program = program
    this.source = source
  }

  compile(): ObjectFile {
    const rootPath = createRootPath(
      TypedCompilerPath<CompilerPath>,
      this.program,
      this.source
    )
    // Perform initial scoping pass
    const scoper = new ScopeVisitor()
    scoper.visit(rootPath)
    // Perform referencing pass
    const reffer = new ReferenceVisitor()
    reffer.visit(rootPath)
    // Perform IL generation pass
    this.visit(rootPath)
    // Perform ASM generation pass
    for (const func of Object.values(this.functions)) {
      func.compile()
    }
    return new ObjectFile({})
  }

  /** Readable debug dump of IL code for each function. */
  dumpIL(): string {
    let res = ""
    for (const [name, def] of Object.entries(this.functions)) {
      const prog = def.program
      res += `${name} v'${def.semver}':\n` + (prog ? dumpIL(prog, "  ") : "")
    }
    return res
  }

  /** Readable debug dump of WFASM code for each function. */
  dumpAsm(): string {
    return Object.values(this.functions)
      .map((fn) => {
        return `${fn.name} v'${fn.semver}'\n${dumpAsm(
          fn.asm ?? [],
          fn.ktable ?? [],
          "  "
        )}`
      })
      .join("\n\n\n")
  }
}
