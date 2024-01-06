import { Parser, Compiler } from "../.."

test("compiler-il: some il", () => {
  const src = `
@version("1.0.0")
fn main(a) {
  const b = a
  let c
}
`
  const p = new Parser(undefined, src)
  const rst = p.parse()
  const cum = new Compiler(rst.program, { input: src })
  cum.compile()
  console.log(cum.dumpIL())
})
