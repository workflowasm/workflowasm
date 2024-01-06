import type * as T from "./types.js"
import { matchers as M } from "./node.js"
import { type Path } from "./traverse.js"

export function findAnnotations<PathT extends Path>(
  node: T.AnnotatedNode,
  path: PathT,
  annotationType: string
): [T.Annotation[], PathT[]] {
  const rst: T.Annotation[] = []
  const rstPath: PathT[] = []
  for (const [index, annotation] of (node.annotations ?? []).entries()) {
    // TODO: support other kinds of annotations...
    if (
      // @something
      (M.isIdentifier(annotation.expression) &&
        annotation.expression.name === annotationType) ||
      // @something(something)
      (M.isCallExpression(annotation.expression) &&
        M.isIdentifier(annotation.expression.callee) &&
        annotation.expression.callee.name === annotationType)
    ) {
      rst.push(annotation)
      rstPath.push(path.get("annotations", index) as PathT)
    }
  }
  return [rst, rstPath]
}

export function getStringLiteralAnnotationArgument(
  node: T.Annotation
): string | undefined {
  const expr = node.expression
  if (!M.isCallExpression(expr)) return undefined
  if (expr.arguments.length !== 1) return undefined
  const arg1 = expr.arguments[0]
  if (!M.isStringLiteral(arg1)) return undefined
  return arg1.value
}

/** Get all identifiers that will be bound by a given pattern */
export function getBindingIdentifiers<PathT extends Path>(
  node: T.Pattern,
  path: PathT
): Array<[T.Identifier, PathT]> {
  if (M.isIdentifier(node)) {
    return [[node, path]]
  } else {
    // XXX: support
    return []
  }
}

export function dotPathToString(dotPath: T.DotPath): string {
  const names = dotPath.identifiers.map((x) => x.name)
  return names.join(".")
}
