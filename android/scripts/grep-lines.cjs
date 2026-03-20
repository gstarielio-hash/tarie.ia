const fs = require("fs");

const [filePath, ...patterns] = process.argv.slice(2);

if (!filePath || patterns.length === 0) {
  console.error("usage: node grep-lines.cjs <file> <pattern1> [pattern2...]");
  process.exit(1);
}

const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

lines.forEach((line, index) => {
  if (patterns.some((pattern) => line.includes(pattern))) {
    process.stdout.write(`${index + 1}:${line}\n`);
  }
});
