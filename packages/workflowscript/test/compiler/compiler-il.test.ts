import { Parser, Compiler } from "../.."

function harness(src: string) {
  const p = new Parser(undefined, src)
  const rst = p.parse()
  const cum = new Compiler(rst.program, { input: src })
  cum.compile()
  console.log(cum.dumpIL())
  console.log(cum.dumpAsm())
}

test("compiler-il: some il", () => {
  harness(`
@version("1.0.0")
fn main(a) {
  const b = a
  let c
  const d = "testing 123"
}
`)
})

test("compiler-il: if", () => {
  harness(`
@version("1.0.0")
fn main(a) {
  if(a) {
    const b = a
  }
}
`)
})

test("compiler-il: if-else", () => {
  harness(`
@version("1.0.0")
fn main(a) {
  let b
  if(a) {
    b = "consequent"
  } else {
    b = "alternate"
  }
}
`)
})
