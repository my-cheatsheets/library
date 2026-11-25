// Reads and checks the library's sheets (spec 18). Plain Node, with no
// packages, so it runs the same here and in the library's own repository.
//
// The validator is the website's own, validate.mjs, passed in as a module, so
// the sheets are checked by exactly the rules the website uses.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The licences a library sheet may use, by their SPDX names. */
export const LICENCES = ["CC-BY-4.0", "CC0-1.0", "CC-BY-SA-4.0"];

const SHEET_FILE = "sheet.json";
const ABOUT_FILE = "about.json";

/** Loads validate.mjs from a path, or says how to get it. */
export async function loadValidator(path) {
  try {
    statSync(path);
  } catch {
    throw new Error(`No validator at ${path}. Download it with:\n  curl -o validate.mjs https://my-cheatsheets.com/validate.mjs`);
  }
  return import(pathToFileURL(path).href);
}

/**
 * Checks every sheet folder in `<root>/sheets`. Returns the problems, each
 * starting with the file it's about, and the sheets that passed, sorted by ID.
 */
export function checkLibrary(root, validator) {
  const problems = [];
  const sheets = [];
  const folder = join(root, "sheets");
  let names;
  try {
    names = readdirSync(folder).filter((name) => !name.startsWith("."));
  } catch {
    return { problems: ["There's no sheets folder."], sheets };
  }
  for (const id of names.sort()) {
    const place = `sheets/${id}`;
    if (!statSync(join(folder, id)).isDirectory()) {
      problems.push(`${place}: isn't a folder. Each sheet has a folder, named by its ID.`);
      continue;
    }
    const before = problems.length;
    if (!validator.ID_PATTERN.test(id)) {
      problems.push(`${place}: the folder's name isn't a valid ID. Use lowercase letters, numbers and hyphens, starting with a letter or number, ${validator.ID_MAX_LENGTH} characters at most.`);
    }
    const files = readdirSync(join(folder, id)).filter((name) => !name.startsWith("."));
    for (const file of files) {
      if (file !== SHEET_FILE && file !== ABOUT_FILE) problems.push(`${place}/${file}: isn't allowed. A sheet's folder holds only ${SHEET_FILE} and ${ABOUT_FILE}.`);
    }
    for (const file of [SHEET_FILE, ABOUT_FILE]) {
      if (!files.includes(file)) problems.push(`${place}: ${file} is missing.`);
    }

    let raw;
    let sheet;
    if (files.includes(SHEET_FILE)) {
      raw = readFileSync(join(folder, id, SHEET_FILE));
      const text = raw.toString("utf8");
      const result = validator.validate(text);
      if (result.valid) {
        sheet = result.sheet;
      } else {
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          // The validator's error says it doesn't parse.
        }
        for (const error of result.errors) {
          const described = validator.describeError(error, parsed);
          problems.push(`${place}/${SHEET_FILE}: ${described.where ? `${described.where}: ` : ""}${described.message}`);
        }
      }
    }

    let about;
    if (files.includes(ABOUT_FILE)) {
      const found = checkAbout(readFileSync(join(folder, id, ABOUT_FILE), "utf8"));
      for (const problem of found.problems) problems.push(`${place}/${ABOUT_FILE}: ${problem}`);
      about = found.about;
    }

    if (problems.length === before) sheets.push({ id, raw, sheet, about });
  }
  if (names.length === 0) problems.push("There are no sheets.");
  return { problems, sheets };
}

/** Checks an about.json's text: its licence and credits, and nothing else. */
export function checkAbout(text) {
  const problems = [];
  let about;
  try {
    about = JSON.parse(text);
  } catch {
    return { problems: ["isn't valid JSON."] };
  }
  if (!isObject(about)) return { problems: ["must be a JSON object."] };

  for (const field of Object.keys(about)) {
    if (field !== "licence" && field !== "credits") problems.push(`"${field}" isn't allowed. Only "licence" and "credits" are.`);
  }
  if (!("licence" in about)) problems.push(`the licence is missing. Use one of ${LICENCES.join(", ")}.`);
  else if (!LICENCES.includes(about.licence)) problems.push(`the licence must be one of ${LICENCES.join(", ")}.`);

  if (!("credits" in about)) problems.push(`the credits are missing. Use an empty list, [], when nothing needs a credit.`);
  else if (!Array.isArray(about.credits)) problems.push("the credits must be a list.");
  else {
    about.credits.forEach((credit, index) => {
      const place = `credit ${index + 1}`;
      if (!isObject(credit)) {
        problems.push(`${place} must be an object with "text", and an optional "url".`);
        return;
      }
      for (const field of Object.keys(credit)) {
        if (field !== "text" && field !== "url") problems.push(`${place}: "${field}" isn't allowed. Only "text" and "url" are.`);
      }
      if (typeof credit.text !== "string" || credit.text.trim() === "") problems.push(`${place}: the text is missing or empty.`);
      else if (credit.text !== credit.text.trim()) problems.push(`${place}: the text has spaces at its start or end.`);
      if ("url" in credit && !isWebAddress(credit.url)) problems.push(`${place}: the url must be a web address starting https://.`);
    });
  }
  return problems.length ? { problems } : { problems, about };
}

/** The published layout's version. A change the website couldn't read starts v2. */
export const LAYOUT = "v1";

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * A sheet's version file: its licence, its credits and the sheet itself, as
 * JSON with no spaces. `raw` is sheet.json's bytes. The website works this out
 * again from the index and the sheet, so it must stay exactly as it is.
 */
export function versionFile(raw, about) {
  return JSON.stringify({ licence: about.licence, credits: about.credits, sheet: JSON.parse(raw.toString("utf8")) });
}

/** A sheet's version: the SHA-256 of its version file. A change to the sheet, its licence or its credits changes it. */
export function versionOf(raw, about) {
  return sha256(versionFile(raw, about));
}

/**
 * The index for checked sheets, as spec 18's "The published folder" says.
 * `libraryHash` is the SHA-256 of the sheets list as JSON with no spaces, so
 * a change to any sheet, licence or credit changes it.
 */
export function buildIndex(sheets) {
  const list = [...sheets]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, raw, sheet, about }) => ({
      id,
      title: sheet.title,
      ...(sheet.description === undefined ? {} : { description: sheet.description }),
      schemaVersion: sheet.schemaVersion,
      sections: sheet.sections.length,
      entries: sheet.sections.reduce((total, section) => total + section.entries.length, 0),
      images: sheet.images?.length ?? 0,
      bytes: raw.length,
      sha256: sha256(raw),
      version: versionOf(raw, about),
      licence: about.licence,
      credits: about.credits
    }));
  return { libraryHash: sha256(JSON.stringify(list)), sheets: list };
}

/** Writes the published folder to `out`, replacing anything there: the index, and each sheet byte for byte. */
export function writePublished(out, sheets) {
  const index = buildIndex(sheets);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, LAYOUT, "sheets"), { recursive: true });
  writeFileSync(join(out, LAYOUT, "index.json"), JSON.stringify(index, null, 2) + "\n");
  for (const { id, raw } of sheets) writeFileSync(join(out, LAYOUT, "sheets", `${id}.json`), raw);
  return index;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWebAddress(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
