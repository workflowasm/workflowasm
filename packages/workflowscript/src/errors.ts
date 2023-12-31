import { codeFrameColumns } from "@babel/code-frame"
import { Position } from "./parser/position.js"
import { type SourceCode } from "./types.js"

export interface WfsErrorConstructor<
  ResultT extends WfsError<DetailsT>,
  DetailsT
> {
  new (arg: WfsErrorConstructorArgs<DetailsT>): ResultT
}

export type WfsErrorConstructorArgs<DetailsT> = {
  message?: string
  loc: Position
  details?: DetailsT
  source?: SourceCode
}

function frameErrorMessage(
  message: string,
  loc?: Position,
  source?: SourceCode
) {
  if (loc === undefined || source === undefined || source.input === undefined)
    return message
  const { line, column } = loc
  const sl = { start: { line, column: column + 1 } }
  const frame = codeFrameColumns(source.input, sl)
  return `${message}\n\n${source.filename ?? "(unknown file)"}@(${line},${
    column + 1
  })\n\n${frame}`
}

export class WfsError<DetailsT> extends SyntaxError {
  loc: Position
  details?: DetailsT

  constructor(args: WfsErrorConstructorArgs<DetailsT>) {
    super(
      frameErrorMessage(args.message ?? "Parse error", args.loc, args.source)
    )
    this.loc = args.loc
    this.details = args.details
  }
}

export function makeErrorClass<T>(message: string | ((details: T) => string)) {
  let messageGenerator: (details: T) => string

  if (typeof message === "string") {
    const str = message
    messageGenerator = () => str
  } else {
    messageGenerator = message
  }

  return class extends WfsError<T> {
    constructor(args: WfsErrorConstructorArgs<T>) {
      super(
        Object.assign({}, args, {
          message: messageGenerator(args.details as T)
        })
      )
    }
  }
}
