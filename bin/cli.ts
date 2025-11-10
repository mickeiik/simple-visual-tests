#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get the command from arguments
const command = process.argv[2];

if (command === "init") {
  const templatePath = path.join(__dirname, "../templates/visual.spec.ts");
  const targetPath = path.join(process.cwd(), "tests/visual.spec.ts");

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(templatePath, targetPath);

  console.log("✓ Created tests/visual.spec.ts");
} else {
  console.log(`
Usage: npx simple-visual-tests <command>

Commands:
  init    Initialize visual regression tests
  `);
}
