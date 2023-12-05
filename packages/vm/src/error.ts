import { Status, Code as StatusCode } from "@workflowasm/protocols-js"
import { type AnyValue, Type } from "./value.js"

export { StatusCode }

export function makeError(code: StatusCode, message: string): AnyValue {
  const status = new Status({ code, message })
  return [Type.OBJECT, status]
}
