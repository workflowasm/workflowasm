import { Position } from "./position.js"
import { toNodeDescription } from "./utils.js"

// XXX: this is here to avoid a dep cycle
export type LValAncestor =
  | { type: "UpdateExpression"; prefix: boolean }
  | {
      type:
        | "ArrayPattern"
        | "AssignmentExpression"
        | "CatchClause"
        | "ForOfStatement"
        | "FormalParameters"
        | "ForInStatement"
        | "ForStatement"
        | "ImportSpecifier"
        | "ImportNamespaceSpecifier"
        | "ImportDefaultSpecifier"
        | "ParenthesizedExpression"
        | "ObjectPattern"
        | "RestElement"
        | "VariableDeclarator"
    }

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

class IllegalReservedWord extends ParseError<{ reservedWord: string }> {
  constructor(args: ParseErrorConstructorArgs<{ reservedWord: string }>) {
    super(
      Object.assign({}, args, {
        message: `Illegal use of reserved word '${args.details?.reservedWord}'`
      })
    )
  }
}

type GenericParseErrorEntry<T> = string | ((details: T) => string)

function genericParseError<T>(message: GenericParseErrorEntry<T>) {
  let messageGenerator: (details: T) => string

  if (typeof message === "string") {
    const str = message
    messageGenerator = () => str
  } else {
    messageGenerator = message
  }

  return class extends ParseError<T> {
    constructor(args: ParseErrorConstructorArgs<T>) {
      super(
        Object.assign({}, args, {
          message: messageGenerator(args.details as T)
        })
      )
    }
  }
}

export const Errors = {
  UnknownError: genericParseError("Unknown error"),
  UnexpectedToken: genericParseError(
    ({ expected, unexpected }: { expected?: string; unexpected?: string }) =>
      `Unexpected token${unexpected != null ? ` '${unexpected}'` : ""}${
        expected != null ? `, expected '${expected}'` : ""
      }`
  ),
  UnexpectedDeclaration: genericParseError("Unexpected declaration"),
  VarRedeclaration,
  UnterminatedComment: genericParseError("Unterminated comment"),
  UnexpectedDigitAfterHash: genericParseError("Unexpected digit after hash"),
  InvalidOrUnexpectedToken,
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
  InvalidEscapedReservedWord,
  MissingSemicolon: genericParseError("Missing semicolon"),
  InvalidParenthesizedAssignment: genericParseError(
    "Invalid parenthesized assignment"
  ),
  RestTrailingComma: genericParseError("Rest trailing comma"),
  IllegalReservedWord,
  InvalidRestAssignmentPattern: genericParseError(
    "Invalid rest operator argument"
  ),
  ElementAfterRest: genericParseError("Element after rest"),
  ParamDupe: genericParseError("Duplicate parameter name"),
  InvalidCoverInitializedName: genericParseError(
    "Invalid shorthand property initializer"
  ),
  InvalidLhsOptionalChaining: genericParseError(
    ({ ancestor }: { ancestor: LValAncestor }) =>
      `Invalid optional chaining in the left-hand side of ${toNodeDescription(
        ancestor
      )}.`
  ),
  InvalidPropertyBindingPattern: genericParseError(
    "Invalid property binding pattern"
  ),
  InvalidLhs: genericParseError(
    ({ ancestor }: { ancestor: LValAncestor }) =>
      `Invalid left-hand side in ${toNodeDescription(ancestor)}.`
  ),
  InvalidLhsBinding: genericParseError(
    ({ ancestor }: { ancestor: LValAncestor }) =>
      `Binding invalid left-hand side in ${toNodeDescription(ancestor)}.`
  ),
  MixingCoalesceWithLogical: genericParseError("Mixing coalesce with logical"),
  UnexpectedTokenUnaryExponentiation: genericParseError(
    "Unexpected token, unary exponentiation"
  ),
  OptionalChainingNoTemplate: genericParseError(
    "Optional chaining no template"
  ),
  InvalidEscapeSequenceTemplate: genericParseError(
    "Invalid escape sequence in template"
  ),
  UnexpectedKeyword: genericParseError(
    ({ keyword }: { keyword: string }) => `Unexpected keyword '${keyword}'`
  ),
  UnexpectedReservedWord: genericParseError(
    ({ reservedWord }: { reservedWord: string }) =>
      `Unexpected reserved word '${reservedWord}`
  ),
  ForInLoopInitializer: genericParseError(
    "Unexpected initializer in for-in loop"
  ),
  DeclarationMissingInitializer: genericParseError(
    "Declaration missing initializer"
  )
}
