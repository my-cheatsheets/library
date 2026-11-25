// Tests for finding versions in the Git history. Run with: node --test "scripts/*.test.mjs"
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { historyVersions } from "./history.mjs";

const hash = (data) => createHash("sha256").update(data).digest("hex");
const folders = [];
after(() => folders.forEach((folder) => rmSync(folder, { recursive: true, force: true, maxRetries: 3 })));

function temporary() {
  const folder = mkdtempSync(join(tmpdir(), "history-"));
  folders.push(folder);
  return folder;
}

/** A Git repository of its own, with nothing from the computer's settings. */
function repository() {
  const root = temporary();
  const git = (...args) =>
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    }).toString();
  git("init", "-q", "-b", "main");
  const write = (id, name, text) => {
    mkdirSync(join(root, "sheets", id), { recursive: true });
    writeFileSync(join(root, "sheets", id, name), text);
  };
  return {
    root,
    git,
    sheet: (id, title) => write(id, "sheet.json", JSON.stringify({ title }, null, 2)),
    about: (id, credits = []) => write(id, "about.json", JSON.stringify({ credits, licence: "CC-BY-4.0" })),
    write,
    commit: (message) => {
      git("add", "-A");
      git("commit", "-q", "--allow-empty", "-m", message);
    }
  };
}

const version = (title, credits = []) => JSON.stringify({ licence: "CC-BY-4.0", credits, sheet: { title } });
const texts = ({ versions }) => [...versions.values()].sort();

describe("historyVersions", () => {
  it("finds each version of a sheet once, by its SHA-256, with an edit to the sheet or only to its credits", () => {
    const repo = repository();
    repo.sheet("knots", "One");
    repo.about("knots");
    repo.commit("Add");
    repo.sheet("knots", "Côte");
    repo.commit("Edit");
    repo.about("knots", [{ text: "Kim" }]);
    repo.commit("Credit");
    repo.write("other", "README.md", "Nothing to do with the sheets");
    repo.commit("Something else");
    const found = historyVersions(repo.root);
    assert.deepEqual(texts(found), [version("One"), version("Côte"), version("Côte", [{ text: "Kim" }])].sort());
    for (const [name, text] of found.versions) assert.equal(name, hash(text));
    assert.deepEqual(found.skipped, []);
  });

  it("keeps the versions of a sheet that's been removed, and of several sheets", () => {
    const repo = repository();
    for (const id of ["bends", "knots"]) {
      repo.sheet(id, id);
      repo.about(id);
    }
    repo.commit("Add");
    rmSync(join(repo.root, "sheets", "bends"), { recursive: true });
    repo.commit("Remove");
    assert.deepEqual(texts(historyVersions(repo.root)), [version("bends"), version("knots")].sort());
  });

  it("takes a merge's result, but not the commits on its branch, which were never published", () => {
    const repo = repository();
    repo.sheet("knots", "One");
    repo.about("knots");
    repo.commit("Add");
    repo.git("switch", "-q", "-c", "fix");
    repo.sheet("knots", "Half done");
    repo.commit("Half");
    repo.sheet("knots", "Done");
    repo.commit("Done");
    repo.git("switch", "-q", "main");
    repo.git("merge", "-q", "--no-ff", "-m", "Merge", "fix");
    assert.deepEqual(texts(historyVersions(repo.root)), [version("One"), version("Done")].sort());
  });

  it("skips what can't be read as a sheet, saying why, and finds the rest", () => {
    const repo = repository();
    repo.sheet("knots", "One");
    repo.about("knots");
    repo.write("not-json", "sheet.json", "{");
    repo.about("not-json");
    repo.write("not-object", "sheet.json", "[]");
    repo.about("not-object");
    repo.sheet("bad-about", "X");
    repo.write("bad-about", "about.json", '{"licence":"none","credits":[]}');
    repo.sheet("no-about", "X");
    repo.commit("Add");
    const found = historyVersions(repo.root);
    assert.deepEqual(texts(found), [version("One")]);
    assert.deepEqual(found.skipped.map((line) => line.replace(/^[0-9a-f]{7}: /, "")).sort(), [
      "bad-about was skipped, as its about.json has problems.",
      "no-about was skipped, as it has no sheet.json or no about.json.",
      "not-json was skipped, as its sheet.json isn't valid JSON.",
      "not-object was skipped, as its sheet.json isn't an object."
    ]);
  });

  it("refuses a clone without the whole history", () => {
    const repo = repository();
    repo.sheet("knots", "One");
    repo.about("knots");
    repo.commit("Add");
    repo.sheet("knots", "Two");
    repo.commit("Edit");
    const shallow = join(temporary(), "clone");
    repo.git("clone", "-q", "--depth", "1", pathToFileURL(repo.root).href, shallow);
    assert.throws(() => historyVersions(shallow), /whole history/);
  });
});
