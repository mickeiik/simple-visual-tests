#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get the command from arguments
const command = process.argv[2];

if (command === "init") {
  const specTemplatePath = path.join(__dirname, "../templates/visual.spec.ts");
  const specTargetPath = path.join(process.cwd(), "tests/visual.spec.ts");

  const vitestConfigTemplatePath = path.join(
    __dirname,
    "../templates/vitest.visual.config.ts"
  );
  const vitestConfigTargetPath = path.join(
    process.cwd(),
    "./vitest.visual.config.ts"
  );

  fs.mkdirSync(path.dirname(specTargetPath), { recursive: true });
  fs.copyFileSync(specTemplatePath, specTargetPath);

  console.log("✓ Created tests/visual.spec.ts");

  fs.mkdirSync(path.dirname(vitestConfigTargetPath), { recursive: true });
  fs.copyFileSync(vitestConfigTemplatePath, vitestConfigTargetPath);

  console.log("✓ Created ./vitest.visual.config.ts");
} else {
  console.log(`
Usage: npx simple-visual-tests <command>

Commands:
  init    Initialize visual regression tests
  `);
}
