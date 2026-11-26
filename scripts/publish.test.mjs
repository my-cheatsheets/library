// Tests for the published folder. Run with: node --test "scripts/*.test.mjs"
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, LAYOUT, versionFile, versionOf, writePublished } from "./library.mjs";

const hash = (data) => createHash("sha256").update(data).digest("hex");

/** A checked sheet, as checkLibrary returns it. */
function sheet(id, { description, images, credits = [], licence = "CC-BY-4.0", group = "Hobbies" } = {}) {
  const value = {
    schemaVersion: 1,
    title: `Title ${id}`,
    ...(description ? { description } : {}),
    ...(images ? { images } : {}),
    sections: [
      { id: "a", title: "A", entries: [{ id: "a1" }, { id: "a2" }] },
      { id: "b", title: "B", entries: [{ id: "b1" }] }
    ]
  };
  const raw = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  return { id, raw, sheet: value, about: { group, licence, credits } };
}

const folders = [];
after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true })));

describe("buildIndex", () => {
  it("lists each sheet's details, counts, size and hash", () => {
    const one = sheet("knots", { description: "Useful knots.", images: [{ id: "i", svg: "<svg/>" }], credits: [{ text: "Me" }] });
    const { sheets } = buildIndex([one]);
    assert.deepEqual(sheets, [
      {
        id: "knots",
        title: "Title knots",
        description: "Useful knots.",
        schemaVersion: 1,
        sections: 2,
        entries: 3,
        images: 1,
        bytes: one.raw.length,
        sha256: hash(one.raw),
        version: hash(JSON.stringify({ licence: "CC-BY-4.0", credits: [{ text: "Me" }], sheet: one.sheet })),
        group: "Hobbies",
        licence: "CC-BY-4.0",
        credits: [{ text: "Me" }]
      }
    ]);
  });

  it("leaves out a missing description, and counts no images as 0", () => {
    const [entry] = buildIndex([sheet("knots")]).sheets;
    assert.equal("description" in entry, false);
    assert.equal(entry.images, 0);
  });

  it("counts bytes, not characters", () => {
    const one = sheet("knots", { description: "Côte d'Ivoire" });
    assert.equal(buildIndex([one]).sheets[0].bytes, Buffer.byteLength(one.raw.toString("utf8"), "utf8"));
    assert.notEqual(one.raw.length, one.raw.toString("utf8").length);
  });

  it("sorts by ID, so the same library always gives the same index", () => {
    const a = buildIndex([sheet("bends"), sheet("knots"), sheet("hitches")]);
    const b = buildIndex([sheet("knots"), sheet("hitches"), sheet("bends")]);
    assert.deepEqual(a.sheets.map((s) => s.id), ["bends", "hitches", "knots"]);
    assert.deepEqual(a, b);
  });

  it("hashes the sheets list, as JSON with no spaces, for libraryHash", () => {
    const index = buildIndex([sheet("knots"), sheet("bends")]);
    assert.equal(index.libraryHash, hash(JSON.stringify(index.sheets)));
  });

  it("changes libraryHash, but not the version, when a sheet's group changes", () => {
    const [before] = buildIndex([sheet("knots")]).sheets;
    const moved = buildIndex([sheet("knots", { group: "Sailing" })]);
    assert.equal(moved.sheets[0].group, "Sailing");
    assert.equal(moved.sheets[0].version, before.version);
    assert.notEqual(moved.libraryHash, buildIndex([sheet("knots")]).libraryHash);
  });

  it("changes libraryHash when a sheet, licence or credit changes", () => {
    const base = buildIndex([sheet("knots")]).libraryHash;
    assert.notEqual(buildIndex([sheet("knots", { description: "New" })]).libraryHash, base);
    assert.notEqual(buildIndex([sheet("knots", { licence: "CC0-1.0" })]).libraryHash, base);
    assert.notEqual(buildIndex([sheet("knots", { credits: [{ text: "Me" }] })]).libraryHash, base);
    assert.notEqual(buildIndex([sheet("knots"), sheet("bends")]).libraryHash, base);
  });
});

describe("versionFile", () => {
  const about = { licence: "CC-BY-4.0", credits: [{ text: "Me", url: "https://example.com" }] };
  const raw = (text) => Buffer.from(text, "utf8");

  it("holds the licence, the credits and the sheet, as JSON with no spaces", () => {
    assert.equal(
      versionFile(raw('{ "title": "Côte d\'Ivoire",\n  "schemaVersion": 1 }'), about),
      '{"licence":"CC-BY-4.0","credits":[{"text":"Me","url":"https://example.com"}],"sheet":{"title":"Côte d\'Ivoire","schemaVersion":1}}'
    );
  });

  it("is the same whatever order about.json lists its fields in", () => {
    assert.equal(versionFile(raw("{}"), { credits: about.credits, licence: about.licence }), versionFile(raw("{}"), about));
  });

  it("has a version that's its SHA-256, in hex", () => {
    const text = versionFile(raw('{"title":"Côte d\'Ivoire"}'), about);
    assert.equal(versionOf(raw('{"title":"Côte d\'Ivoire"}'), about), hash(Buffer.from(text, "utf8")));
    assert.match(versionOf(raw("{}"), about), /^[0-9a-f]{64}$/);
  });

  it("has another version when the sheet, its licence or its credits change, but not its spacing", () => {
    const base = versionOf(raw('{"title":"A"}'), about);
    assert.notEqual(versionOf(raw('{"title":"B"}'), about), base);
    assert.notEqual(versionOf(raw('{"title":"A"}'), { ...about, licence: "CC0-1.0" }), base);
    assert.notEqual(versionOf(raw('{"title":"A"}'), { ...about, credits: [] }), base);
    assert.equal(versionOf(raw('{\n  "title": "A"\n}\n'), about), base);
  });
});

describe("writePublished", () => {
  it("writes the index and each sheet byte for byte, under the layout's version", () => {
    const out = mkdtempSync(join(tmpdir(), "published-"));
    folders.push(out);
    const sheets = [sheet("knots", { description: "Côte d'Ivoire" }), sheet("bends")];
    const index = writePublished(out, sheets);

    assert.equal(LAYOUT, "v1");
    assert.deepEqual(readdirSync(out), ["v1"]);
    assert.deepEqual(JSON.parse(readFileSync(join(out, "v1", "index.json"), "utf8")), index);
    assert.deepEqual(readdirSync(join(out, "v1", "sheets")).sort(), ["bends.json", "knots.json"]);
    assert.deepEqual(readdirSync(join(out, "v1", "versions")).sort(), index.sheets.map((s) => `${s.version}.json`).sort());
    for (const one of sheets) {
      const written = readFileSync(join(out, "v1", "sheets", `${one.id}.json`));
      assert.ok(written.equals(one.raw));
      assert.equal(hash(written), index.sheets.find((s) => s.id === one.id).sha256);
    }
  });

  it("writes the versions it's given, beside the sheets' own, each under its own SHA-256", () => {
    const out = mkdtempSync(join(tmpdir(), "published-"));
    folders.push(out);
    const old = versionFile(sheet("knots", { description: "Old." }).raw, { licence: "CC-BY-4.0", credits: [] });
    const index = writePublished(out, [sheet("knots")], new Map([[hash(old), old]]));
    const names = readdirSync(join(out, "v1", "versions"));
    assert.deepEqual(names.sort(), [`${hash(old)}.json`, `${index.sheets[0].version}.json`].sort());
    for (const name of names) assert.equal(`${hash(readFileSync(join(out, "v1", "versions", name)))}.json`, name);
  });

  it("replaces anything already in the folder", () => {
    const out = mkdtempSync(join(tmpdir(), "published-"));
    folders.push(out);
    mkdirSync(join(out, "v1", "sheets"), { recursive: true });
    writeFileSync(join(out, "v1", "sheets", "gone.json"), "{}");
    writeFileSync(join(out, "stray.txt"), "");
    writePublished(out, [sheet("knots")]);
    assert.deepEqual(readdirSync(out), ["v1"]);
    assert.deepEqual(readdirSync(join(out, "v1", "sheets")), ["knots.json"]);
  });
});
