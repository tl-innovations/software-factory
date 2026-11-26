// Policy for Bash commands Claude runs inside factory products.
// evaluateCommand() returns null (no opinion → normal permission flow), or {decision, reason}.
// "deny" blocks the command; "ask" forces a human confirmation (and is denied in headless runs).
//
// This is a guardrail, not a sandbox: it catches common mistakes, not a determined adversary.

const DANGEROUS_RM_TARGETS = new Set([
  "/",
  "/*",
  "~",
  "~/",
  "~/*",
  "$HOME",
  "${HOME}",
  ".",
  "./",
  "*",
  "..",
  "../",
]);
const SECRET_FILE =
  /(^|[\\/])\.env(\.(?!example\b|sample\b|template\b|defaults\b)[\w.-]+)?$|\.(pem|key|p8|p12|pfx|jks|keystore)$/i;
const READERS = new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "type",
  "bat",
  "nl",
  "strings",
  "xxd",
  "od",
  "base64",
]);

const ASK_PATTERNS = [
  [/\bgit\s+reset\s+--hard\b/, "git reset --hard discards local work."],
  [/\bgit\s+clean\s+-[a-zA-Z]*f/, "git clean -f deletes untracked files."],
  [/\bgit\s+branch\s+-D\b/, "Force-deleting a branch."],
  [
    /\b(npm|pnpm|bun)\s+publish\b|\byarn\s+(npm\s+)?publish\b/,
    "Publishing a package is a release step a human approves.",
  ],
  [
    /\beas(-cli(@\S+)?)?\s+submit\b/,
    "Submitting to the App Store / Google Play needs human approval.",
  ],
  [
    /\beas(-cli(@\S+)?)?\s+update\b.*--(branch|channel)[\s=]+["']?production\b/,
    "Publishing an OTA update to production users needs human approval.",
  ],
  [
    /\beas(-cli(@\S+)?)?\s+build\b.*--profile[\s=]+["']?production\b/,
    "Starting a production store build needs human approval.",
  ],
  [
    /\beas(-cli(@\S+)?)?\s+workflow:run\b/,
    "Running an EAS workflow (builds/submits) needs human approval.",
  ],
  [/\bvercel\b.*\s--prod\b/, "Production deploy needs human approval."],
  [
    /\bnetlify\s+deploy\b.*\s--prod\b/,
    "Production deploy needs human approval.",
  ],
  [/\bfirebase\s+deploy\b/, "Deploy needs human approval."],
  [/\bwrangler\s+(pages\s+)?deploy\b/, "Deploy needs human approval."],
  [/\bgh\s+release\s+create\b/, "Creating a release needs human approval."],
  [
    /\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+TABLE)\b/i,
    "Destructive SQL statement.",
  ],
  [
    /\b(prisma\s+migrate\s+reset|supabase\s+db\s+reset)\b/,
    "Resets a database.",
  ],
];

/** Split a command line into simple segments on ; && || | and newlines (good enough for policy checks). */
export function splitSegments(command) {
  return command
    .split(/\r?\n|&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Tokenize a segment, honouring simple quotes, and drop leading env assignments / sudo / command. */
export function tokenize(segment) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) tokens.push(m[1] ?? m[2] ?? m[3]);
  while (
    tokens.length &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0]) ||
      ["sudo", "command", "exec", "time", "nohup"].includes(tokens[0]))
  ) {
    tokens.shift();
  }
  return tokens;
}

function gitSubcommand(tokens) {
  // git [-C <path>] [-c <k=v>] [--no-pager] <subcommand> ...
  if (tokens[0] !== "git") return null;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-C" || t === "-c" || t === "--git-dir" || t === "--work-tree") {
      i++;
      continue;
    }
    if (t.startsWith("-")) continue;
    return { name: t, args: tokens.slice(i + 1) };
  }
  return null;
}

function normalizeRef(ref) {
  return ref.replace(/^\+/, "").replace(/^refs\/heads\//, "");
}

function checkGitPush(args, ctx) {
  const flags = args.filter((a) => a.startsWith("-"));
  const positionals = args.filter((a) => !a.startsWith("-"));
  const isForce = flags.some(
    (f) =>
      f === "--force" ||
      f === "--force-if-includes" ||
      (/^-[a-zA-Z]+$/.test(f) && f.includes("f")),
  );
  const lease = flags.some((f) => f.startsWith("--force-with-lease"));
  if (flags.includes("--no-verify"))
    return {
      decision: "deny",
      reason: "Skipping git hooks (--no-verify) is not allowed.",
    };
  if (flags.includes("--mirror") || flags.includes("--all"))
    return {
      decision: "deny",
      reason:
        "git push --all/--mirror can overwrite protected branches. Push your feature branch only.",
    };
  if (flags.includes("--delete") || flags.includes("-d")) {
    const targets = positionals.slice(1).map(normalizeRef);
    if (targets.some((t) => ctx.protectedBranches.includes(t)))
      return { decision: "deny", reason: "Deleting a protected branch." };
    return { decision: "ask", reason: "Deleting a remote branch." };
  }

  const refspecs = positionals.slice(1);
  let destinations;
  if (refspecs.length === 0) {
    const current = ctx.currentBranch();
    destinations = current ? [current] : [];
  } else {
    destinations = refspecs.map((spec) => {
      if (spec.startsWith("+"))
        return { forced: true, ref: normalizeRef(spec.split(":").pop()) };
      const dest = spec.includes(":") ? spec.split(":").pop() : spec;
      return normalizeRef(
        dest === "HEAD" ? ctx.currentBranch() || "HEAD" : dest,
      );
    });
  }
  for (const d of destinations) {
    const ref = typeof d === "string" ? d : d.ref;
    if (typeof d === "object" && d.forced)
      return {
        decision: "deny",
        reason: `Force push (+refspec) to ${ref}. Ask the human.`,
      };
    if (ctx.protectedBranches.includes(ref)) {
      return {
        decision: "deny",
        reason: `Direct push to protected branch "${ref}". Push a feature branch and open a PR (/factory:ship).`,
      };
    }
  }
  if (isForce)
    return {
      decision: "deny",
      reason:
        "Force push is not allowed. Use --force-with-lease on your own feature branch, or ask the human.",
    };
  if (lease)
    return {
      decision: "ask",
      reason: "Force-with-lease rewrites remote history on this branch.",
    };
  return null;
}

function checkSegment(segment, ctx) {
  const tokens = tokenize(segment);
  if (!tokens.length) return null;
  const [cmd] = tokens;

  if (cmd === "rm") {
    const recursive = tokens.some(
      (t) => t === "--recursive" || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(t),
    );
    const targets = tokens.slice(1).filter((t) => !t.startsWith("-"));
    if (recursive && targets.some((t) => DANGEROUS_RM_TARGETS.has(t))) {
      return {
        decision: "deny",
        reason: `Recursive delete of "${targets.join(" ")}" is blocked.`,
      };
    }
  }

  if (
    READERS.has(cmd) &&
    tokens.slice(1).some((t) => !t.startsWith("-") && SECRET_FILE.test(t))
  ) {
    return {
      decision: "deny",
      reason:
        "Reading secret files (.env, keys, keystores) is blocked. Use .env.example to see which variables exist.",
    };
  }

  const sub = gitSubcommand(tokens);
  if (sub?.name === "push") return checkGitPush(sub.args, ctx);
  if (sub?.name === "commit" && sub.args.includes("--no-verify")) {
    return {
      decision: "deny",
      reason: "Skipping git hooks (--no-verify) is not allowed.",
    };
  }
  if (
    sub?.name === "commit" &&
    sub.args.some(
      (a) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a) && !a.startsWith("--"),
    )
  ) {
    return {
      decision: "deny",
      reason: "git commit -n skips hooks; not allowed.",
    };
  }

  if (cmd === "gh" && tokens[1] === "pr" && tokens[2] === "merge") {
    return {
      decision: "deny",
      reason:
        "Merging is a human decision in this factory. Leave the PR for review.",
    };
  }
  if (cmd === "gh" && tokens[1] === "repo" && tokens[2] === "delete") {
    return { decision: "deny", reason: "Deleting repositories is blocked." };
  }
  return null;
}

/**
 * @param {string} command
 * @param {{protectedBranches?: string[], currentBranch?: () => string|null}} options
 */
export function evaluateCommand(command, options = {}) {
  const ctx = {
    protectedBranches: options.protectedBranches ?? ["main", "master"],
    currentBranch: options.currentBranch ?? (() => null),
  };
  const results = [];

  if (
    /\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(python3?|node)\b/i.test(
      command,
    )
  ) {
    results.push({
      decision: "deny",
      reason:
        "Piping a download straight into a shell/interpreter is blocked. Download, inspect, then run.",
    });
  }
  for (const segment of splitSegments(command)) {
    const r = checkSegment(segment, ctx);
    if (r) results.push(r);
  }
  for (const [re, reason] of ASK_PATTERNS) {
    if (re.test(command)) results.push({ decision: "ask", reason });
  }
  return (
    results.find((r) => r.decision === "deny") ??
    results.find((r) => r.decision === "ask") ??
    null
  );
}
