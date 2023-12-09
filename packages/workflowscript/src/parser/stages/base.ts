import type { Options } from "../options.js"
import type State from "../state.js"
import { Position, buildPosition } from "../position.js"
import { type ParseErrorConstructor, ParseError } from "../error.js"
import { Node } from "../../ast.js"

type RaiseProperties<DetailsT> = { at: Position | Node } & DetailsT

export class BaseParser {
  declare options: Options
  filename?: string
  // Names of exports store. `default` is stored as a name for both
  // `export default foo;` and `export { foo as default };`.
  exportedIdentifiers = new Set<string>()

  // Initialized by Tokenizer
  declare state: State

  // input and length are not in state as they are constant and we do
  // not want to ever copy them, which happens if state gets cloned
  input: string = ""
  length: number = 0

  // Does this represent an attempt to lookahead in the token stream?
  isLookahead: boolean = false

  /**
   * Raise a `ParseError` given the appropriate properties. If passed a
   * `Position` for the `at` property, raises the `ParseError` at that location.
   * Otherwise, if passed a `Node`, raises the `ParseError` at the start
   * location of that `Node`.
   *
   * If `errorRecovery` is `true`, the error is pushed to the errors array and
   * returned. If `errorRecovery` is `false`, the error is instead thrown.
   */
  raise<ErrorT extends ParseError<DetailsT>, DetailsT>(
    errorClass: ParseErrorConstructor<ErrorT, DetailsT>,
    raiseProperties: RaiseProperties<DetailsT>
  ): ParseError<DetailsT> {
    const { at, ...details } = raiseProperties
    const loc = at instanceof Position ? at : at.loc.start
    const error = new errorClass({ loc, details: details as DetailsT })

    if (!this.options.errorRecovery) throw error
    if (!this.isLookahead) this.state.errors.push(error)

    return error
  }

  /**
   * If `errorRecovery` is `false`, this method behaves identically to `raise`.
   * If `errorRecovery` is `true`, this method will first see if there is
   * already an error stored at the same `Position`, and replaces it with the
   * one generated here.
   */
  raiseOverwrite<ErrorT extends ParseError<DetailsT>, DetailsT>(
    errorClass: ParseErrorConstructor<ErrorT, DetailsT>,
    raiseProperties: RaiseProperties<DetailsT>
  ): ParseError<DetailsT> | never {
    const { at, ...details } = raiseProperties
    const loc = at instanceof Position ? at : at.loc.start
    const pos = loc.index
    const errors = this.state.errors

    for (let i = errors.length - 1; i >= 0; i--) {
      const error = errors[i]
      if (error.loc.index === pos) {
        return (errors[i] = new errorClass({
          loc,
          details: details as DetailsT
        }))
      }
      if (error.loc.index < pos) break
    }

    return this.raise(errorClass, raiseProperties)
  }

  errorBuilder(error: ParseErrorConstructor<ParseError<unknown>, unknown>) {
    return (pos: number, lineStart: number, curLine: number) => {
      this.raise(error, {
        at: buildPosition(pos, lineStart, curLine)
      })
    }
  }
}
