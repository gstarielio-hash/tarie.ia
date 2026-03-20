const fs = require("fs");

const [filePath, skipArg, firstArg] = process.argv.slice(2);

if (!filePath || !skipArg || !firstArg) {
  console.error("usage: node print-lines.cjs <file> <skip> <first>");
  process.exit(1);
}

const skip = Number(skipArg);
const first = Number(firstArg);
const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
const end = Math.min(lines.length, skip + first);

for (let i = skip; i < end; i += 1) {
  process.stdout.write(`${i + 1}:${lines[i]}\n`);
}
