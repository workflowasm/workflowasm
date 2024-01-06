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
  p.parse()
  //console.dir(rst, { depth: 50 })
})

test("parse error", () => {
  const p = new Parser(
    undefined,
    `
import your mom
`
  )
  p.parse()
})
