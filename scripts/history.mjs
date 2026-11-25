// Finds every version each sheet has had, from the repository's own history
// (spec 29). The website compares a copy someone made with the version it was
// copied from, so every version ever published must stay published.
import { execFileSync } from "node:child_process";
import { checkAbout, isObject, sha256, versionFile } from "./library.mjs";

/** Runs Git in `root`, giving its output as bytes. */
function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Each commit that `main` has been, newest first. It follows first parents, so
 * a commit made on a pull request's branch, which was never published, isn't one.
 */
function commits(root) {
  if (git(root, "rev-parse", "--is-shallow-repository").toString().trim() === "true") {
    throw new Error("This clone doesn't have the whole history, so old versions would be lost. Run: git fetch --unshallow");
  }
  return git(root, "rev-list", "--first-parent", "HEAD").toString().trim().split("\n");
}

/** The sheet.json and about.json of each sheet at a commit, as blob IDs by sheet ID. */
function sheetsAt(root, commit) {
  const sheets = new Map();
  for (const line of git(root, "ls-tree", "-r", "-z", commit, "--", "sheets/").toString().split("\0")) {
    const found = /^\d+ blob ([0-9a-f]+)\tsheets\/([^/]+)\/(sheet|about)\.json$/.exec(line);
    if (!found) continue;
    const [, blob, id, name] = found;
    sheets.set(id, { ...sheets.get(id), [name]: blob });
  }
  return sheets;
}

/** One version's file, or why there isn't one. */
function read(root, { sheet, about }) {
  if (!sheet || !about) return { problem: "it has no sheet.json or no about.json" };
  const checked = checkAbout(git(root, "cat-file", "blob", about).toString("utf8"));
  if (checked.problems.length) return { problem: "its about.json has problems" };
  const raw = git(root, "cat-file", "blob", sheet);
  try {
    if (!isObject(JSON.parse(raw.toString("utf8")))) return { problem: "its sheet.json isn't an object" };
  } catch {
    return { problem: "its sheet.json isn't valid JSON" };
  }
  return { text: versionFile(raw, checked.about) };
}

/**
 * Every version of every sheet in the history of `root`'s current commit, as
 * version files by version, and a line for each that can't be read. Throws if
 * the history isn't all there.
 */
export function historyVersions(root) {
  const versions = new Map();
  const skipped = [];
  const seen = new Set();
  for (const commit of commits(root)) {
    for (const [id, blobs] of sheetsAt(root, commit)) {
      // Most commits leave most sheets as they were.
      const key = `${blobs.sheet} ${blobs.about}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { text, problem } = read(root, blobs);
      if (problem) skipped.push(`${commit.slice(0, 7)}: ${id} was skipped, as ${problem}.`);
      else versions.set(sha256(text), text);
    }
  }
  return { versions, skipped };
}
