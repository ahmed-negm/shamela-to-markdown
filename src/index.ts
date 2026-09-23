#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { convertShamelaHtmlToMarkdown } from './convert';

function outputPathFor(inputPath: string): string {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.md`);
}

function main(): void {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error('Usage: shamela-to-markdown <input.htm> [more.htm ...]');
    process.exit(1);
  }

  for (const input of inputs) {
    const inputPath = path.resolve(input);
    const outputPath = outputPathFor(inputPath);

    const html = fs.readFileSync(inputPath, 'utf-8');
    const markdown = convertShamelaHtmlToMarkdown(html);
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    console.log(`${path.basename(inputPath)} -> ${path.basename(outputPath)} (${markdown.length} chars)`);
  }
}

main();
