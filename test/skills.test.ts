import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("bundled skills", () => {
  it("packages the plugin icon and skill directories", () => {
    const packageJson = JSON.parse(read("package.json")) as { files?: string[] };

    expect(packageJson.files).toContain("assets");
    expect(packageJson.files).toContain("skills");
    expect(existsSync(join(root, "assets/icon.svg"))).toBe(true);
  });

  it("has valid names, descriptions, and local references", () => {
    for (const name of ["noted", "reviewable-html"]) {
      const relativePath = `skills/${name}/SKILL.md`;
      const skill = read(relativePath);
      const frontmatter = skill.match(/^---\n([\s\S]+?)\n---/);
      const declaredName = frontmatter?.[1].match(/^name:\s*['"]?([^'"\n]+)['"]?$/m)?.[1];
      const description = frontmatter?.[1].match(/^description:\s*['"]?(.+?)['"]?$/m)?.[1];

      expect(declaredName).toBe(name);
      expect(description?.length).toBeGreaterThan(0);
      expect(description?.length).toBeLessThanOrEqual(1024);

      for (const link of skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        expect(existsSync(join(root, `skills/${name}`, link[1]))).toBe(true);
      }
    }
  });

  it("documents every public Noted CLI command and option", () => {
    const skill = read("skills/noted/SKILL.md");
    const commands = read("skills/noted/references/commands.md");
    const text = `${skill}\n${commands}`;

    for (const command of ["open", "reply", "status", "end", "file"]) {
      expect(text).toContain(`bb noted ${command}`);
    }
    for (const option of [
      "--view",
      "--reply-to",
      "--reopen",
      "--json",
      "--to",
      "--title",
      "--summary",
      "--profile",
    ]) {
      expect(text).toContain(option);
    }
    expect(skill).toContain("Noted: feedback on");
    expect(skill).toContain("Do not poll");
  });

  it("ships a matching reviewable-html skill and fallback template", () => {
    const skill = read("skills/reviewable-html/SKILL.md");
    const template = read("skills/reviewable-html/assets/noted-review.html");

    expect(skill).toMatch(/^---\nname: reviewable-html\n/m);
    expect(skill).toContain("Use whenever an agent will write an .html file");
    expect(skill).toContain("assets/noted-review.html");
    expect(skill).toContain("matching brand/design skill");
    expect(skill).toContain("data URLs generated from the supplied");
    expect(skill).toContain("without a base URL");
    expect(template).toContain("<!doctype html>");
    expect(template).toContain('id="recommendation"');
    expect(template).toContain('id="evidence"');
    expect(template).toContain('id="risks-and-open-questions"');
    expect(template).toContain("@media (max-width: 760px)");
    expect(template).toContain("@media (max-width: 600px)");
    expect(template).toContain('data-label="Status"');
    expect(template).toContain(":focus-visible");
    expect(template).not.toMatch(/<script\b/i);
  });
});
