// Checks every sheet in the library, with the website's own validator.
//   node scripts/check.mjs [path to validate.mjs]
// The validator defaults to validate.mjs in the library's folder. Get it with:
//   curl -o validate.mjs https://my-cheatsheets.com/validate.mjs
// Exits with 1 if any sheet has a problem.
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { checkLibrary, loadValidator } from "./library.mjs";

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
  console.error(`${problems.length} ${problems.length === 1 ? "problem" : "problems"}:`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`All ${sheets.length} ${sheets.length === 1 ? "sheet passes" : "sheets pass"}.`);
}
