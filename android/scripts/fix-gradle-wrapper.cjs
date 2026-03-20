const { existsSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");

const TARGET_DISTRIBUTION =
  "https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip";

const files = [
  path.join(
    process.cwd(),
    "android",
    "gradle",
    "wrapper",
    "gradle-wrapper.properties",
  ),
  path.join(process.cwd(), "android", "gradle.properties"),
];

for (const filePath of files) {
  if (!existsSync(filePath)) {
    continue;
  }

  const current = readFileSync(filePath, "utf8");
  let next = current.replace(
    /distributionUrl=https\\:\/\/services\.gradle\.org\/distributions\/gradle-[^\r\n]+/g,
    `distributionUrl=${TARGET_DISTRIBUTION}`,
  );

  next = next.replace(/^newArchEnabled=.*(?:\r?\n)?/gm, "");

  if (current !== next) {
    writeFileSync(filePath, next, "utf8");
    console.log(`Gradle wrapper ajustado em ${filePath}`);
  }
}
