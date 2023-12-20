import * as charCodes from "charcodes"
import { LineBasedPosition } from "./position.js"

// The following character codes are forbidden from being
// an immediate sibling of NumericLiteralSeparator _
const forbiddenNumericSeparatorSiblings = {
  decBinOct: new Set<number>([
    charCodes.dot,
    charCodes.uppercaseB,
    charCodes.uppercaseE,
    charCodes.uppercaseO,
    charCodes.underscore, // multiple separators are not allowed
    charCodes.lowercaseB,
    charCodes.lowercaseE,
    charCodes.lowercaseO
  ]),
  hex: new Set<number>([
    charCodes.dot,
    charCodes.uppercaseX,
    charCodes.underscore, // multiple separators are not allowed
    charCodes.lowercaseX
  ])
}

const isAllowedNumericSeparatorSibling = {
  // 0 - 1
  bin: (ch: number) => ch === charCodes.digit0 || ch === charCodes.digit1,

  // 0 - 7
  oct: (ch: number) => ch >= charCodes.digit0 && ch <= charCodes.digit7,

  // 0 - 9
  dec: (ch: number) => ch >= charCodes.digit0 && ch <= charCodes.digit9,

  // 0 - 9, A - F, a - f,
  hex: (ch: number) =>
    (ch >= charCodes.digit0 && ch <= charCodes.digit9) ||
    (ch >= charCodes.uppercaseA && ch <= charCodes.uppercaseF) ||
    (ch >= charCodes.lowercaseA && ch <= charCodes.lowercaseF)
}

export type StringContentsErrorHandlers = EscapedCharErrorHandlers & {
  unterminated(
    initialPos: number,
    initialLineStart: number,
    initialCurLine: number
  ): void
}

export function readStringContents(
  type: "single" | "double" | "template",
  input: string,
  pos: number,
  lineStart: number,
  curLine: number,
  errors: StringContentsErrorHandlers
) {
  const initialPos = pos
  const initialLineStart = lineStart
  const initialCurLine = curLine

  let out = ""
  let firstInvalidLoc: LineBasedPosition | undefined = undefined
  let chunkStart = pos
  const { length } = input
  for (;;) {
    if (pos >= length) {
      errors.unterminated(initialPos, initialLineStart, initialCurLine)
      out += input.slice(chunkStart, pos)
      break
    }
    const ch = input.charCodeAt(pos)
    if (isStringEnd(type, ch, input, pos)) {
      out += input.slice(chunkStart, pos)
      break
    }
    if (ch === charCodes.backslash) {
      out += input.slice(chunkStart, pos)
      const res = readEscapedChar(
        input,
        pos,
        lineStart,
        curLine,
        type === "template",
        errors
      )
      if (res.ch === null && !firstInvalidLoc) {
        firstInvalidLoc = { pos, lineStart, curLine }
      } else {
        out += res.ch
      }
      ;({ pos, lineStart, curLine } = res)
      chunkStart = pos
    } else if (
      ch === charCodes.lineSeparator ||
      ch === charCodes.paragraphSeparator
    ) {
      ++pos
      ++curLine
      lineStart = pos
    } else if (ch === charCodes.lineFeed || ch === charCodes.carriageReturn) {
      if (type === "template") {
        out += input.slice(chunkStart, pos) + "\n"
        ++pos
        if (
          ch === charCodes.carriageReturn &&
          input.charCodeAt(pos) === charCodes.lineFeed
        ) {
          ++pos
        }
        ++curLine
        chunkStart = lineStart = pos
      } else {
        errors.unterminated(initialPos, initialLineStart, initialCurLine)
      }
    } else {
      ++pos
    }
  }
  return {
    pos,
    str: out,
    firstInvalidLoc,
    lineStart,
    curLine,
    containsInvalid: !!firstInvalidLoc
  }
}

function isStringEnd(
  type: "single" | "double" | "template",
  ch: number,
  input: string,
  pos: number
) {
  if (type === "template") {
    return (
      ch === charCodes.graveAccent ||
      (ch === charCodes.dollarSign &&
        input.charCodeAt(pos + 1) === charCodes.leftCurlyBrace)
    )
  }
  return (
    ch === (type === "double" ? charCodes.quotationMark : charCodes.apostrophe)
  )
}

type EscapedCharErrorHandlers = HexCharErrorHandlers &
  CodePointErrorHandlers & {
    strictNumericEscape(pos: number, lineStart: number, curLine: number): void
  }

function readEscapedChar(
  input: string,
  pos: number,
  lineStart: number,
  curLine: number,
  inTemplate: boolean,
  errors: EscapedCharErrorHandlers
) {
  const throwOnInvalid = !inTemplate
  pos++ // skip '\'

  const res = (ch: string | null) => ({ pos, ch, lineStart, curLine })

  const ch = input.charCodeAt(pos++)
  switch (ch) {
    case charCodes.lowercaseN:
      return res("\n")
    case charCodes.lowercaseR:
      return res("\r")
    case charCodes.lowercaseX: {
      let code
      ;({ code, pos } = readHexChar(
        input,
        pos,
        lineStart,
        curLine,
        2,
        false,
        throwOnInvalid,
        errors
      ))
      return res(code === null ? null : String.fromCharCode(code))
    }
    case charCodes.lowercaseU: {
      let code
      ;({ code, pos } = readCodePoint(
        input,
        pos,
        lineStart,
        curLine,
        throwOnInvalid,
        errors
      ))
      return res(code === null ? null : String.fromCodePoint(code))
    }
    case charCodes.lowercaseT:
      return res("\t")
    case charCodes.lowercaseB:
      return res("\b")
    case charCodes.lowercaseV:
      return res("\u000b")
    case charCodes.lowercaseF:
      return res("\f")
    // @ts-expect-error Fallthrough intentional
    case charCodes.carriageReturn:
      if (input.charCodeAt(pos) === charCodes.lineFeed) {
        ++pos
      }
    // fall through
    // @ts-expect-error Fallthrough intentional
    case charCodes.lineFeed:
      lineStart = pos
      ++curLine
    // fall through
    case charCodes.lineSeparator:
    case charCodes.paragraphSeparator:
      return res("")
    case charCodes.digit8:
    // @ts-expect-error Fallthrough intentional
    case charCodes.digit9:
      if (inTemplate) {
        return res(null)
      } else {
        errors.strictNumericEscape(pos - 1, lineStart, curLine)
      }
    // fall through
    default:
      if (ch >= charCodes.digit0 && ch <= charCodes.digit7) {
        const startPos = pos - 1
        const match = input.slice(startPos, pos + 2).match(/^[0-7]+/)!

        let octalStr = match[0]

        let octal = parseInt(octalStr, 8)
        if (octal > 255) {
          octalStr = octalStr.slice(0, -1)
          octal = parseInt(octalStr, 8)
        }
        pos += octalStr.length - 1
        const next = input.charCodeAt(pos)
        if (
          octalStr !== "0" ||
          next === charCodes.digit8 ||
          next === charCodes.digit9
        ) {
          if (inTemplate) {
            return res(null)
          } else {
            errors.strictNumericEscape(startPos, lineStart, curLine)
          }
        }

        return res(String.fromCharCode(octal))
      }

      return res(String.fromCharCode(ch))
  }
}

type HexCharErrorHandlers = IntErrorHandlers & {
  invalidEscapeSequence(pos: number, lineStart: number, curLine: number): void
}

// Used to read character escape sequences ('\x', '\u').
function readHexChar(
  input: string,
  pos: number,
  lineStart: number,
  curLine: number,
  len: number,
  forceLen: boolean,
  throwOnInvalid: boolean,
  errors: HexCharErrorHandlers
) {
  const initialPos = pos
  let n
  ;({ n, pos } = readInt(
    input,
    pos,
    lineStart,
    curLine,
    16,
    len,
    forceLen,
    false,
    errors,
    /* bailOnError */ !throwOnInvalid
  ))
  if (n === null) {
    if (throwOnInvalid) {
      errors.invalidEscapeSequence(initialPos, lineStart, curLine)
    } else {
      pos = initialPos - 1
    }
  }
  return { code: n, pos }
}

export type IntErrorHandlers = {
  numericSeparatorInEscapeSequence(
    pos: number,
    lineStart: number,
    curLine: number
  ): void
  unexpectedNumericSeparator(
    pos: number,
    lineStart: number,
    curLine: number
  ): void
  // It can return "true" to indicate that the error was handled
  // and the int parsing should continue.
  invalidDigit(
    pos: number,
    lineStart: number,
    curLine: number,
    radix: number
  ): boolean
}

export function readInt(
  input: string,
  pos: number,
  lineStart: number,
  curLine: number,
  radix: number,
  len: number | undefined,
  forceLen: boolean,
  allowNumSeparator: boolean | "bail",
  errors: IntErrorHandlers,
  bailOnError: boolean
) {
  const start = pos
  const forbiddenSiblings =
    radix === 16
      ? forbiddenNumericSeparatorSiblings.hex
      : forbiddenNumericSeparatorSiblings.decBinOct
  const isAllowedSibling =
    radix === 16
      ? isAllowedNumericSeparatorSibling.hex
      : radix === 10
        ? isAllowedNumericSeparatorSibling.dec
        : radix === 8
          ? isAllowedNumericSeparatorSibling.oct
          : isAllowedNumericSeparatorSibling.bin

  let invalid = false
  let total = 0

  for (let i = 0, e = len ?? Infinity; i < e; ++i) {
    const code = input.charCodeAt(pos)
    let val

    if (code === charCodes.underscore && allowNumSeparator !== "bail") {
      const prev = input.charCodeAt(pos - 1)
      const next = input.charCodeAt(pos + 1)

      if (!allowNumSeparator) {
        if (bailOnError) return { n: null, pos }
        errors.numericSeparatorInEscapeSequence(pos, lineStart, curLine)
      } else if (
        Number.isNaN(next) ||
        !isAllowedSibling(next) ||
        forbiddenSiblings.has(prev) ||
        forbiddenSiblings.has(next)
      ) {
        if (bailOnError) return { n: null, pos }
        errors.unexpectedNumericSeparator(pos, lineStart, curLine)
      }

      // Ignore this _ character
      ++pos
      continue
    }

    if (code >= charCodes.lowercaseA) {
      val = code - charCodes.lowercaseA + charCodes.lineFeed
    } else if (code >= charCodes.uppercaseA) {
      val = code - charCodes.uppercaseA + charCodes.lineFeed
    } else if (charCodes.isDigit(code)) {
      val = code - charCodes.digit0 // 0-9
    } else {
      val = Infinity
    }
    if (val >= radix) {
      // If we found a digit which is too big, errors.invalidDigit can return true to avoid
      // breaking the loop (this is used for error recovery).
      if (val <= 9 && bailOnError) {
        return { n: null, pos }
      } else if (
        val <= 9 &&
        errors.invalidDigit(pos, lineStart, curLine, radix)
      ) {
        val = 0
      } else if (forceLen) {
        val = 0
        invalid = true
      } else {
        break
      }
    }
    ++pos
    total = total * radix + val
  }
  if (pos === start || (len != null && pos - start !== len) || invalid) {
    return { n: null, pos }
  }

  return { n: total, pos }
}

export type CodePointErrorHandlers = HexCharErrorHandlers & {
  invalidCodePoint(pos: number, lineStart: number, curLine: number): void
}

export function readCodePoint(
  input: string,
  pos: number,
  lineStart: number,
  curLine: number,
  throwOnInvalid: boolean,
  errors: CodePointErrorHandlers
) {
  const ch = input.charCodeAt(pos)
  let code

  if (ch === charCodes.leftCurlyBrace) {
    ++pos
    ;({ code, pos } = readHexChar(
      input,
      pos,
      lineStart,
      curLine,
      input.indexOf("}", pos) - pos,
      true,
      throwOnInvalid,
      errors
    ))
    ++pos
    if (code !== null && code > 0x10ffff) {
      if (throwOnInvalid) {
        errors.invalidCodePoint(pos, lineStart, curLine)
      } else {
        return { code: null, pos }
      }
    }
  } else {
    ;({ code, pos } = readHexChar(
      input,
      pos,
      lineStart,
      curLine,
      4,
      false,
      throwOnInvalid,
      errors
    ))
  }
  return { code, pos }
}

// Matches a whole line break (where CRLF is considered a single
// line break). Used to count lines.
export const lineBreak = /\r\n?|[\n\u2028\u2029]/
export const lineBreakG = new RegExp(lineBreak.source, "g")

// https://tc39.github.io/ecma262/#sec-line-terminators
export function isNewLine(code: number): boolean {
  switch (code) {
    case charCodes.lineFeed:
    case charCodes.carriageReturn:
    case charCodes.lineSeparator:
    case charCodes.paragraphSeparator:
      return true

    default:
      return false
  }
}

export const skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g

export const skipWhiteSpaceInLine =
  /(?:[^\S\n\r\u2028\u2029]|\/\/.*|\/\*.*?\*\/)*/g

// Skip whitespace and single-line comments, including /* no newline here */.
// After this RegExp matches, its lastIndex points to a line terminator, or
// the start of multi-line comment (which is effectively a line terminator),
// or the end of string.
export const skipWhiteSpaceToLineBreak = new RegExp(
  // Unfortunately JS doesn't support Perl's atomic /(?>pattern)/ or
  // possessive quantifiers, so we use a trick to prevent backtracking
  // when the look-ahead for line terminator fails.
  "(?=(" +
    // Capture the whitespace and comments that should be skipped inside
    // a look-ahead assertion, and then re-match the group as a unit.
    skipWhiteSpaceInLine.source +
    "))\\1" +
    // Look-ahead for either line terminator, start of multi-line comment,
    // or end of string.
    /(?=[\n\r\u2028\u2029]|\/\*(?!.*?\*\/)|$)/.source,
  "y" // sticky
)

// https://tc39.github.io/ecma262/#sec-white-space
export function isWhitespace(code: number): boolean {
  switch (code) {
    case 0x0009: // CHARACTER TABULATION
    case 0x000b: // LINE TABULATION
    case 0x000c: // FORM FEED
    case charCodes.space:
    case charCodes.nonBreakingSpace:
    case charCodes.oghamSpaceMark:
    case 0x2000: // EN QUAD
    case 0x2001: // EM QUAD
    case 0x2002: // EN SPACE
    case 0x2003: // EM SPACE
    case 0x2004: // THREE-PER-EM SPACE
    case 0x2005: // FOUR-PER-EM SPACE
    case 0x2006: // SIX-PER-EM SPACE
    case 0x2007: // FIGURE SPACE
    case 0x2008: // PUNCTUATION SPACE
    case 0x2009: // THIN SPACE
    case 0x200a: // HAIR SPACE
    case 0x202f: // NARROW NO-BREAK SPACE
    case 0x205f: // MEDIUM MATHEMATICAL SPACE
    case 0x3000: // IDEOGRAPHIC SPACE
    case 0xfeff: // ZERO WIDTH NO-BREAK SPACE
      return true

    default:
      return false
  }
}

const NodeDescriptions = {
  ArrayPattern: "array destructuring pattern",
  AssignmentExpression: "assignment expression",
  AssignmentPattern: "assignment expression",
  ArrowFunctionExpression: "arrow function expression",
  ConditionalExpression: "conditional expression",
  CatchClause: "catch clause",
  ForOfStatement: "for-of statement",
  ForInStatement: "for-in statement",
  ForStatement: "for-loop",
  FormalParameters: "function parameter list",
  Identifier: "identifier",
  ImportSpecifier: "import specifier",
  ImportDefaultSpecifier: "import default specifier",
  ImportNamespaceSpecifier: "import namespace specifier",
  ObjectPattern: "object destructuring pattern",
  ParenthesizedExpression: "parenthesized expression",
  RestElement: "rest element",
  UpdateExpression: {
    true: "prefix operation",
    false: "postfix operation"
  },
  VariableDeclarator: "variable declaration",
  YieldExpression: "yield expression"
}

type NodeTypesWithDescriptions = keyof Omit<
  typeof NodeDescriptions,
  "UpdateExpression"
>

type NodeWithDescription =
  | {
      type: "UpdateExpression"
      prefix: boolean
    }
  | {
      type: NodeTypesWithDescriptions
    }

// @ts-expect-error prefix is specified only when type is UpdateExpression
// eslint-disable-next-line no-confusing-arrow
export const toNodeDescription = ({ type, prefix }: NodeWithDescription) =>
  type === "UpdateExpression"
    ? NodeDescriptions.UpdateExpression[String(prefix) as "true" | "false"]
    : NodeDescriptions[type]
