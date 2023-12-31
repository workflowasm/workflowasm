import { Parser, Compiler } from "../.."

test("basic compiler", () => {
  const src = `
// A comment
import from pak.chooie.unf { pusher }

/**
 * Doc comment
 */
@export
@version("1.0.x")
fn main() {}
`
  const p = new Parser(undefined, src)
  const rst = p.parse()
  const cum = new Compiler(rst.program, { input: src })
  cum.compile()
})

test("compiler: missing version", () => {
  const src = `
@export
fn main() {}
`
  const p = new Parser(undefined, src)
  const rst = p.parse()
  const cum = new Compiler(rst.program, { input: src })
  cum.compile()
})

test("compiler: missing version arg", () => {
  const src = `
@export
@version()
fn main() {}
`
  const p = new Parser(undefined, src)
  const rst = p.parse()
  const cum = new Compiler(rst.program, { input: src })
  cum.compile()
})

test("compiler: excess version args", () => {
  const src = `
@export
@version("1","2")
fn main() {}
`
  const p = new Parser(undefined, src)
  const rst = p.parse()
  const cum = new Compiler(rst.program, { input: src })
  cum.compile()
})

test("compiler: mistyped version args", () => {
  const src = `
@export
@version(1)
fn main() {}
`
  const p = new Parser(undefined, src)
  const rst = p.parse()
  const cum = new Compiler(rst.program, { input: src })
  cum.compile()
})
