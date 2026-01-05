#!/usr/bin/env bun
import * as Fs from "node:fs";
import * as Path from "node:path";
import * as Xml from "./Xml.js";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
md2rfc - Convert Markdown to xml2rfc v3 format

Usage:
  md2rfc <input.md> [-o <output.xml>]

Options:
  -o, --output  Output file path (use "-" for stdout)

Examples:
  md2rfc draft.md
  md2rfc draft.md -o out/draft.xml
  md2rfc draft.md -o - | xml2rfc --text --html /dev/stdin
`);
    process.exit(args.length === 0 ? 1 : 0);
  }

  const outputIndex = args.findIndex((a) => a === "-o" || a === "--output");
  let outputPath: string | undefined;
  let inputPath: string | undefined;

  if (outputIndex !== -1) {
    outputPath = args[outputIndex + 1];
    inputPath = args.filter((_, i) => i !== outputIndex && i !== outputIndex + 1)[0];
  } else {
    inputPath = args[0];
  }

  if (!inputPath) {
    console.error("Error: No input file specified");
    process.exit(1);
  }

  outputPath ??= inputPath.replace(/\.md$/, ".xml");

  try {
    const markdown = Fs.readFileSync(inputPath, "utf-8");
    const xml = Xml.fromMarkdown(markdown);

    if (outputPath === "-") {
      process.stdout.write(xml);
    } else {
      const outputDir = Path.dirname(outputPath);
      if (outputDir && !Fs.existsSync(outputDir)) {
        Fs.mkdirSync(outputDir, { recursive: true });
      }
      Fs.writeFileSync(outputPath, xml);
      console.error(`Converted ${inputPath} → ${outputPath}`);
    }
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
