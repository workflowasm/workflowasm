import { TypedPath, type Path, Visitor } from "../ast/traverse.js"
import type * as T from "../ast/types.js"
import { ObjectFile, Function } from "@workflowasm/protocols-js"
import { matchers as M } from "../ast/node.js"
import { type SourceCode } from "../types.js"
import { makeErrorClass } from "../errors.js"
import {
  findAnnotations,
  getStringLiteralAnnotationArgument
} from "../ast/util.js"

const CompilationError = makeErrorClass(
  (details: { message: string }) => details.message
)

export class Compiler extends Visitor<Path> {
  /** The parsed input program */
  program: T.Program

  /** The source code (used for error framing) */
  source?: SourceCode

  /** The package definition */
  package?: string

  /** Collected function definitions */
  // eslint-disable-next-line @typescript-eslint/ban-types
  functions: { [key: string]: Function } = {}

  constructor(program: T.Program, source?: SourceCode) {
    super()
    this.program = program
    this.source = source
  }

  compile(): ObjectFile {
    this.visit(TypedPath.root<Path>(this.program, this.source))
    return new ObjectFile({})
  }

  override enter(path: Path): void {
    const { node } = path
    if (M.isFunctionDeclaration(node)) {
      this.enterFunctionDeclaration(path, node)
    }
  }

  override exit(_path: Path): void {
    // const { node } = path
  }

  enterFunctionDeclaration(path: Path, node: T.FunctionDeclaration) {
    if (M.isProgram(path.parent?.node)) {
      // Root-level function declaration
      const [versions, paths] = findAnnotations(node, path, "version")
      if (versions.length !== 1) {
        throw path.raise(CompilationError, {
          message:
            "Top-level function declarations must have a `@version(semver)` annotation."
        })
      }
      const annotationPath = paths[0]
      const version = getStringLiteralAnnotationArgument(versions[0])
      if (version === undefined) {
        throw annotationPath.raise(CompilationError, {
          message: `\`@version\` must be supplied with a single string literal argument representing the semver of the function.`
        })
      }
    } else {
      // Sub-level function declaration
      // TODO: impl
      throw path.raise(CompilationError, {
        message: "Sub-level function declarations are not yet supported."
      })
    }
  }
}
