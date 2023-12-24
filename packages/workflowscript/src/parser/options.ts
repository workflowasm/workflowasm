export type Options = {
  errorRecovery: boolean
  startLine?: number
  startColumn?: number
  tokens: boolean
  attachComment: boolean
  ranges: boolean
  createParenthesizedExpressions: boolean
  sourceFilename?: string
}

export const defaultOptions: Options = {
  errorRecovery: false,
  startColumn: 0,
  startLine: 1,
  sourceFilename: undefined,
  ranges: false,
  tokens: false,
  attachComment: true,
  createParenthesizedExpressions: false
}

export function getOptions(opts?: Options | null): Options {
  if (opts == null) return { ...defaultOptions }

  return Object.assign({}, defaultOptions, opts)
}
