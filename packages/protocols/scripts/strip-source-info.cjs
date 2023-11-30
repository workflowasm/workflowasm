/* eslint-disable no-console */
// Strip source code info from a FileDescriptorSet json file, making
// it smaller for packaging purposes.
const { readFile, writeFile } = require("node:fs/promises")

function stripSourceInfo(obj) {
  if(Array.isArray(obj)) {
    for(const entry of obj) {
      stripSourceInfo(entry)
    }
  } else if (typeof(obj) === "object") {
    if("sourceCodeInfo" in obj) {
      delete obj.sourceCodeInfo
    }
    for(const v of Object.values(obj)) {
      stripSourceInfo(v)
    }
  }
}

async function main() {
  const infile = process.argv[2]
  // Read the json file
  const text = await readFile(infile, { encoding: "utf8" })
  const json = JSON.parse(text)
  // Remove all sourceCodeInfo tags
  stripSourceInfo(json)
  // Write over the infile
  const newText = JSON.stringify(json)
  await writeFile(infile, newText, { encoding: 'utf8' })
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
