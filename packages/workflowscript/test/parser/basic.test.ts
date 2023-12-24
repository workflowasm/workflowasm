import { Parser } from "../.."

test("basic parser", () => {
  const p = new Parser(
    undefined,
    `
// A comment
import from pak.chooie.unf { pusher }

/**
 * Doc comment
 */
@export
@version("1.0.x")
fn main() {}
`
  )
  const rst = p.parse()
  console.dir(rst, { depth: 50 })
})
