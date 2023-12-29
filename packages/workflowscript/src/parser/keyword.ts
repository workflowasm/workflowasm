const reservedWords = {
  keyword: [
    "break",
    "case",
    "catch",
    "continue",
    "debugger",
    "default",
    "do",
    "else",
    "finally",
    "for",
    "fn",
    "if",
    "return",
    "switch",
    "throw",
    "try",
    "const",
    "while",
    "new",
    "this",
    "super",
    "class",
    "extends",
    "import",
    "null",
    "true",
    "false",
    "typeof",
    "void",
    "delete",
    "await",
    "enum",
    "implements",
    "interface",
    "let",
    "package",
    "private",
    "protected",
    "public",
    "static",
    "yield",
    "eval"
  ]
}
const keywords = new Set(reservedWords.keyword)

export function isReservedWord(word: string): boolean {
  return keywords.has(word)
}

export function isKeyword(word: string): boolean {
  return keywords.has(word)
}

export function canBeReservedWord(word: string): boolean {
  return keywords.has(word)
}

export const keywordRelationalOperator = /^in(stanceof)?$/
