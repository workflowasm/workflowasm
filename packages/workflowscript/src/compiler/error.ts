import { makeErrorClass } from "../errors.js"

export const Errors = {
  CompilationError: makeErrorClass(
    (details: { message: string }) => details.message
  ),
  UnresolvedIdentifier: makeErrorClass(
    (details: { name: string }) => `Unresolved identifier: '${details.name}'`
  )
}
