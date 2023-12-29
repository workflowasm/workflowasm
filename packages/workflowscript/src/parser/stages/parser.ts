import type { Options } from "../options.js"
import type * as N from "../../ast/types.js"
import { getOptions } from "../options.js"
import StatementParser from "./statement.js"
import { ScopeHandler } from "./scope.js"

export default class Parser extends StatementParser {
  constructor(options: Options | undefined, input: string) {
    options = getOptions(options)
    super(options, input)

    this.options = options
    this.initializeScopes()
    this.filename = options.sourceFilename
  }

  // This can be overwritten, for example, by the TypeScript plugin.
  getScopeHandler(): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (...args: any[]): ScopeHandler
  } {
    return ScopeHandler
  }

  parse(): N.File {
    this.enterInitialScopes()
    const file = this.startNode() as N.File
    const program = this.startNode() as N.Program
    this.nextToken()
    file.errors = undefined
    this.parseTopLevel(file, program)
    file.errors = this.state.errors
    return file
  }
}
