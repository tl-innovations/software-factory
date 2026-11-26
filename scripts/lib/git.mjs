// git + gh helpers for working on product repos.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fail, run } from "./util.mjs";

export const git = (args, cwd, opts = {}) => run("git", args, { cwd, ...opts });
export const gh = (args, opts = {}) => run("gh", args, opts);

export function ghJson(args, opts = {}) {
  const r = gh(args, { allowFail: true, ...opts });
  if (r.code !== 0) return null;
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

/** Clone (or fetch) a product into the factory's disposable workspace. */
export function ensureClone(product, cfg) {
  const dir = join(cfg.workspaceDirAbs, product.name);
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dirname(dir), { recursive: true });
    gh(["repo", "clone", product.repo, dir, "--", "--quiet"]);
  } else {
    git(["fetch", "origin", "--prune", "--quiet"], dir);
  }
  return dir;
}

export function defaultBranch(dir) {
  const read = () =>
    git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], dir, {
      allowFail: true,
    });
  let r = read();
  if (r.code !== 0) {
    git(["remote", "set-head", "origin", "--auto"], dir, { allowFail: true });
    r = read();
  }
  return r.code === 0 ? r.stdout.trim().replace(/^origin\//, "") : "main";
}

export const isDirty = (dir) =>
  git(["status", "--porcelain"], dir).stdout.trim() !== "";

/** Reset a workspace clone onto a fresh branch from origin/<base>. Refuses to discard local changes. */
export function startBranch(dir, branch, base) {
  if (isDirty(dir))
    fail(
      `${dir} has uncommitted changes. Workspace clones are disposable: inspect, then delete the folder.`,
    );
  git(["checkout", "--quiet", "-B", branch, `origin/${base}`], dir);
}

/** Stage everything and commit. Returns false when there was nothing to commit. */
export function commitAll(dir, message) {
  git(["add", "-A"], dir);
  if (git(["diff", "--cached", "--quiet"], dir, { allowFail: true }).code === 0)
    return false;
  git(["commit", "--quiet", "-F", "-"], dir, { input: message });
  return true;
}

export function commitsAhead(dir, base) {
  const r = git(["rev-list", "--count", `origin/${base}..HEAD`], dir, {
    allowFail: true,
  });
  return r.code === 0 ? Number(r.stdout.trim()) : 0;
}

/** Push a factory-owned branch (force-with-lease: these branches are rewritten on every run). */
export function pushBranch(dir, branch) {
  git(["push", "--quiet", "--force-with-lease", "-u", "origin", branch], dir);
}

/** Open a PR, or return the URL of the already-open PR for this branch. */
export function openPr(dir, { base, head, title, body }) {
  const existing = ghJson(
    ["pr", "list", "--head", head, "--state", "open", "--json", "url"],
    { cwd: dir },
  );
  if (existing?.length) return { url: existing[0].url, created: false };
  const r = gh(
    [
      "pr",
      "create",
      "--base",
      base,
      "--head",
      head,
      "--title",
      title,
      "--body-file",
      "-",
    ],
    { cwd: dir, input: body },
  );
  return { url: r.stdout.trim().split(/\r?\n/).pop(), created: true };
}

/** Fetch a file from a GitHub repo via the contents API. Returns null if missing. */
export function remoteFile(repo, path, ref) {
  const data = ghJson([
    "api",
    `repos/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
  ]);
  if (!data?.content) return null;
  return Buffer.from(data.content, "base64").toString("utf8");
}
