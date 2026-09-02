import { execFileSync } from "node:child_process";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const checkout = process.env.LAVISH_CHECKOUT;
if (!checkout) throw new Error("LAVISH_CHECKOUT is required");

const status = execFileSync("git", ["status", "--porcelain", "--", "vendor/lavish"], { encoding: "utf8" });
if (status.trim()) throw new Error("vendor/lavish has uncommitted changes");

for (const file of ["artifact-sdk.js", "mermaid-node.js", "table-cell.js"]) {
  await copyFile(path.join(checkout, "src", file), path.join("vendor/lavish", file));
}

const manifest = JSON.parse(await readFile(path.join(checkout, "package.json"), "utf8"));
await writeFile("vendor/lavish/VERSION", `v${manifest.version}\n`);
execFileSync("git", ["diff", "--stat", "--", "vendor/lavish"], { stdio: "inherit" });
