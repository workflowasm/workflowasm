import { Status, Code } from "@workflowasm/protocols-js"
import { TaggedValue, TypeTag } from "./value.js"

export { Code as StatusCode }

export function makeError(code: Code, message: string): TaggedValue {
  const status = new Status({ code, message })
  return [TypeTag.TYPE_OBJECT, status]
}
