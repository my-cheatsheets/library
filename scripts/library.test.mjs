// Tests for the library's check. Run with: node --test "scripts/*.test.mjs"
// They use a small stand-in for validate.mjs, so they test the check itself,
// not the sheet format. CI also runs the check on the real sheets, with the
// real validator.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkAbout, checkLibrary, LICENCES } from "./library.mjs";

/** Accepts any JSON object with a title. Refuses others, with a described error. */
const validator = {
  ID_MAX_LENGTH: 40,
  ID_PATTERN: /^[a-z0-9][a-z0-9-]{0,39}$/,
  validate(raw) {
    try {
      const sheet = JSON.parse(raw);
      if (typeof sheet?.title === "string") return { valid: true, sheet };
      return { valid: false, errors: [{ code: "MISSING_FIELD", path: "/title" }] };
    } catch {
      return { valid: false, errors: [{ code: "PARSE_ERROR", path: "" }] };
    }
  },
  describeError(error) {
    return error.code === "PARSE_ERROR" ? { where: "", message: "this isn't valid JSON." } : { where: "The sheet", message: "the title is missing." };
  }
};

const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** Makes a library folder from { "sheets/id/file": text }. */
function library(files) {
  const root = mkdtempSync(join(tmpdir(), "library-"));
  roots.push(root);
  mkdirSync(join(root, "sheets"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const goodSheet = JSON.stringify({ title: "Knots" });
const goodAbout = JSON.stringify({ licence: "CC-BY-4.0", credits: [] });
const good = (id) => ({ [`sheets/${id}/sheet.json`]: goodSheet, [`sheets/${id}/about.json`]: goodAbout });

describe("checkLibrary", () => {
  it("passes good sheets, sorted by ID, with their bytes, sheet and about", () => {
    const { problems, sheets } = checkLibrary(library({ ...good("knots"), ...good("bends") }), validator);
    assert.deepEqual(problems, []);
    assert.deepEqual(sheets.map((s) => s.id), ["bends", "knots"]);
    assert.equal(sheets[0].raw.toString("utf8"), goodSheet);
    assert.deepEqual(sheets[0].sheet, { title: "Knots" });
    assert.deepEqual(sheets[0].about, { licence: "CC-BY-4.0", credits: [] });
  });

  it("ignores hidden files, such as .DS_Store", () => {
    const { problems } = checkLibrary(library({ ...good("knots"), "sheets/.DS_Store": "", "sheets/knots/.DS_Store": "" }), validator);
    assert.deepEqual(problems, []);
  });

  it("refuses a folder name that isn't an ID", () => {
    const { problems, sheets } = checkLibrary(library(good("Capital Cities")), validator);
    assert.match(problems[0], /^sheets\/Capital Cities: the folder's name isn't a valid ID/);
    assert.equal(sheets.length, 0);
  });

  it("refuses a file in sheets/ that isn't a folder", () => {
    const { problems } = checkLibrary(library({ ...good("knots"), "sheets/stray.json": "{}" }), validator);
    assert.deepEqual(problems, ["sheets/stray.json: isn't a folder. Each sheet has a folder, named by its ID."]);
  });

  it("refuses missing files and extra files", () => {
    const { problems } = checkLibrary(library({ "sheets/knots/sheet.json": goodSheet, "sheets/knots/notes.txt": "" }), validator);
    assert.deepEqual(problems, [
      "sheets/knots/notes.txt: isn't allowed. A sheet's folder holds only sheet.json and about.json.",
      "sheets/knots: about.json is missing."
    ]);
  });

  it("refuses a sheet the validator refuses, as the import page words it", () => {
    const { problems } = checkLibrary(library({ ...good("knots"), "sheets/knots/sheet.json": "{}" }), validator);
    assert.deepEqual(problems, ["sheets/knots/sheet.json: The sheet: the title is missing."]);
    const broken = checkLibrary(library({ ...good("knots"), "sheets/knots/sheet.json": "{ nope" }), validator);
    assert.deepEqual(broken.problems, ["sheets/knots/sheet.json: this isn't valid JSON."]);
  });

  it("names the about.json with a problem", () => {
    const { problems } = checkLibrary(library({ ...good("knots"), "sheets/knots/about.json": "{}" }), validator);
    assert.equal(problems.length, 2);
    assert.ok(problems.every((p) => p.startsWith("sheets/knots/about.json: ")));
  });

  it("refuses a library with no sheets folder, or no sheets", () => {
    const root = mkdtempSync(join(tmpdir(), "library-"));
    roots.push(root);
    assert.deepEqual(checkLibrary(root, validator).problems, ["There's no sheets folder."]);
    assert.deepEqual(checkLibrary(library({}), validator).problems, ["There are no sheets."]);
  });
});

describe("checkAbout", () => {
  const about = (value) => checkAbout(JSON.stringify(value));

  it("accepts each allowed licence, with or without credits and links", () => {
    for (const licence of LICENCES) assert.deepEqual(about({ licence, credits: [] }).problems, []);
    const credits = [{ text: "Flag of Oman: Government of Oman" }, { text: "Photo", url: "https://example.com/licence" }];
    assert.deepEqual(about({ licence: "CC-BY-4.0", credits }), { problems: [], about: { licence: "CC-BY-4.0", credits } });
  });

  it("refuses text that isn't a JSON object", () => {
    assert.deepEqual(checkAbout("{ nope").problems, ["isn't valid JSON."]);
    assert.deepEqual(checkAbout("[]").problems, ["must be a JSON object."]);
  });

  it("refuses a missing or unknown licence, including more restrictive ones", () => {
    assert.match(about({ credits: [] }).problems[0], /^the licence is missing/);
    for (const licence of ["CC-BY-NC-4.0", "CC-BY-ND-4.0", "MIT", "cc-by-4.0"]) {
      assert.match(about({ licence, credits: [] }).problems[0], /^the licence must be one of/);
    }
  });

  it("refuses missing credits, and credits that aren't a list", () => {
    assert.match(about({ licence: "CC0-1.0" }).problems[0], /^the credits are missing/);
    assert.deepEqual(about({ licence: "CC0-1.0", credits: "Me" }).problems, ["the credits must be a list."]);
  });

  it("refuses a credit with no text, untidy text, a bad link or other fields", () => {
    const problems = about({
      licence: "CC-BY-4.0",
      credits: ["Me", { text: "" }, { text: " Me" }, { text: "Me", url: "http://example.com" }, { text: "Me", url: "nope" }, { text: "Me", by: "x" }]
    }).problems;
    assert.deepEqual(problems, [
      'credit 1 must be an object with "text", and an optional "url".',
      "credit 2: the text is missing or empty.",
      "credit 3: the text has spaces at its start or end.",
      "credit 4: the url must be a web address starting https://.",
      "credit 5: the url must be a web address starting https://.",
      'credit 6: "by" isn\'t allowed. Only "text" and "url" are.'
    ]);
  });

  it("refuses other fields, so a typing mistake is caught", () => {
    assert.deepEqual(about({ licence: "CC-BY-4.0", credits: [], licnece: "x" }).problems, ['"licnece" isn\'t allowed. Only "licence" and "credits" are.']);
  });
});
