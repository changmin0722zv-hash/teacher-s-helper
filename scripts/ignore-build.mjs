import { execFileSync } from "node:child_process";

// Vercel: exit 0 skips a build; exit 1 requests a build.
// The live app reads planner data via the GitHub API, not from the deployed bundle.
try {
  const base = process.env.VERCEL_GIT_PREVIOUS_SHA || "HEAD^";
  if (!/^[a-f0-9]{40}$/.test(base) && base !== "HEAD^") process.exit(1);
  const changed = execFileSync("git", ["diff", "--name-only", base, "HEAD"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (changed.length && changed.every((file) => file === "data/planner.json")) {
    console.log(
      "Only planner data changed; the running app reads the latest data directly.",
    );
    process.exit(0);
  }
} catch {
  // First deployment or shallow history: build instead of guessing.
}
process.exit(1);
