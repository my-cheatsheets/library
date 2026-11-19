// Builds the published folder, _site/, for GitHub Pages (spec 18):
//   _site/v1/index.json and _site/v1/sheets/<id>.json
// It checks the library first, and writes nothing if any sheet has a problem.
//   node scripts/publish.mjs [path to validate.mjs]
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { checkLibrary, loadValidator, writePublished } from "./library.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const validatorPath = resolve(process.argv[2] ?? `${root}validate.mjs`);

let validator;
try {
  validator = await loadValidator(validatorPath);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const { problems, sheets } = checkLibrary(root, validator);
if (problems.length) {
  console.error(`Not published: ${problems.length} ${problems.length === 1 ? "problem" : "problems"}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
const out = join(root, "_site");
const index = writePublished(out, sheets);
console.log(`Published ${index.sheets.length} sheets to ${out}. Library hash ${index.libraryHash}.`);
