import { Position } from "./position.js"

export enum ParseErrorCode {
  UNKNOWN = 0,
  VARIABLE_REDECLARATION = 1
}

export interface ParseErrorConstructor<
  ResultT extends ParseError<DetailsT>,
  DetailsT
> {
  new (arg: ParseErrorConstructorArgs<DetailsT>): ResultT
}

type ParseErrorConstructorArgs<DetailsT> = {
  message?: string
  loc: Position
  details?: DetailsT
}

export class ParseError<DetailsT> extends Error {
  code: ParseErrorCode = ParseErrorCode.UNKNOWN
  loc: Position
  details?: DetailsT

  constructor(args: ParseErrorConstructorArgs<DetailsT>) {
    super(args.message ?? "Parse error")
    this.loc = args.loc
    this.details = args.details
  }
}

class VarRedeclaration extends ParseError<{ identifierName: string }> {
  constructor(args: ParseErrorConstructorArgs<{ identifierName: string }>) {
    super(
      Object.assign({}, args, {
        message: `Variable redeclaration of ${args.details?.identifierName}`
      })
    )
  }
}

class InvalidOrUnexpectedToken extends ParseError<{ unexpected: string }> {
  constructor(args: ParseErrorConstructorArgs<{ unexpected: string }>) {
    super(
      Object.assign({}, args, {
        message: `Invalid or unexpected token: ${args.details?.unexpected}`
      })
    )
  }
}

class UnexpectedToken extends ParseError<{ expected?: string }> {
  constructor(args: ParseErrorConstructorArgs<{ expected?: string }>) {
    super(
      Object.assign({}, args, {
        message:
          args.details?.expected !== undefined
            ? `Unexpected token, expected: ${args.details.expected}`
            : "Unexpected token"
      })
    )
  }
}

class InvalidDigit extends ParseError<{ radix: number }> {
  constructor(args: ParseErrorConstructorArgs<{ radix: number }>) {
    super(
      Object.assign({}, args, {
        message: `Invalid digit for radix ${args.details?.radix}`
      })
    )
  }
}

class InvalidEscapedReservedWord extends ParseError<{ reservedWord: string }> {
  constructor(args: ParseErrorConstructorArgs<{ reservedWord: string }>) {
    super(
      Object.assign({}, args, {
        message: `Invalid escaped reserved word ${args.details?.reservedWord}`
      })
    )
  }
}

function genericParseError(message: string) {
  return class extends ParseError<unknown> {
    constructor(args: ParseErrorConstructorArgs<unknown>) {
      super(
        Object.assign({}, args, {
          message
        })
      )
    }
  }
}

export const Errors = {
  UnknownError: genericParseError("Unknown error"),
  VarRedeclaration,
  UnterminatedComment: genericParseError("Unterminated comment"),
  UnexpectedDigitAfterHash: genericParseError("Unexpected digit after hash"),
  InvalidOrUnexpectedToken,
  UnexpectedToken,
  InvalidDigit,
  NumberIdentifier: genericParseError("Number identifier"),
  InvalidOrMissingExponent: genericParseError("Invalid or missing exponent"),
  UnterminatedString: genericParseError("Unterminated string"),
  UnterminatedTemplate: genericParseError("Unterminated template"),
  InvalidNumber: genericParseError("Invalid number"),
  MissingUnicodeEscape: genericParseError("Missing Unicode escape"),
  EscapedCharNotAnIdentifier: genericParseError(
    "Escaped character is not an identifier"
  ),
  NumericSeparatorInEscapeSequence: genericParseError(
    "Numeric separator in escape sequence"
  ),
  UnexpectedNumericSeparator: genericParseError("Unexpected numeric separator"),
  InvalidEscapeSequence: genericParseError("Invalid escape sequence"),
  InvalidCodePoint: genericParseError("Invalid code point"),
  StrictNumericEscape: genericParseError("Strict numeric escape"),
  InvalidEscapedReservedWord
}
