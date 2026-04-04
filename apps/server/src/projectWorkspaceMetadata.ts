import fs from "node:fs";
import path from "node:path";

import {
  type ProjectAgentsFileInput,
  type ProjectAgentsFileResult,
  type ProjectCommandTemplate,
  ProjectCommandTemplate as ProjectCommandTemplateSchema,
  type ProjectCommandTemplateIssue,
  type ProjectDraftAgentsFileInput,
  type ProjectDraftAgentsFileResult,
  type ProjectListCommandTemplatesInput,
  type ProjectListCommandTemplatesResult,
  type ProjectListSkillsInput,
  type ProjectListSkillsResult,
  type ProjectSkill,
  ProjectSkill as ProjectSkillSchema,
  type ProjectSkillIssue,
  type ProjectSkillName,
} from "@t3tools/contracts";
import { Schema } from "effect";

const AGENTS_FILE_NAME = "AGENTS.md";
const COMMANDS_DIRECTORY_RELATIVE_PATH = ".rowl/commands";
const SKILLS_DIRECTORY_RELATIVE_PATH = ".rowl/skills";
const SKILL_FILE_NAME = "SKILL.md";
const INIT_SECTION_START = "<!-- ROWL_INIT:START -->";
const INIT_SECTION_END = "<!-- ROWL_INIT:END -->";

function safeReadTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function safeReadDirectoryNames(dirPath: string): string[] {
  try {
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function safeReadTopLevelEntries(cwd: string): string[] {
  try {
    return fs
      .readdirSync(cwd, { withFileTypes: true })
      .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
      .toSorted((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function readPackageJson(cwd: string): Record<string, unknown> | null {
  const raw = safeReadTextFile(path.join(cwd, "package.json"));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readPackageScripts(packageJson: Record<string, unknown> | null): string[] {
  const scripts = packageJson?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return [];
  }
  return Object.keys(scripts).toSorted((left, right) => left.localeCompare(right));
}

function detectPackageManager(
  cwd: string,
  packageJson: Record<string, unknown> | null,
): string | null {
  const declared =
    typeof packageJson?.packageManager === "string" ? packageJson.packageManager : null;
  if (declared) {
    const normalized = declared.split("@")[0]?.trim();
    return normalized && normalized.length > 0 ? normalized : declared;
  }
  if (fs.existsSync(path.join(cwd, "bun.lock")) || fs.existsSync(path.join(cwd, "bun.lockb"))) {
    return "bun";
  }
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) {
    return "npm";
  }
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) {
    return "yarn";
  }
  return null;
}

function buildInitManagedSection(cwd: string): string {
  const packageJson = readPackageJson(cwd);
  const packageManager = detectPackageManager(cwd, packageJson);
  const scriptNames = readPackageScripts(packageJson);
  const topLevelEntries = safeReadTopLevelEntries(cwd);
  const apps = safeReadDirectoryNames(path.join(cwd, "apps"));
  const packages = safeReadDirectoryNames(path.join(cwd, "packages"));
  const validationScripts = ["fmt", "lint", "typecheck", "test"].filter((name) =>
    scriptNames.includes(name),
  );

  const lines: string[] = [
    INIT_SECTION_START,
    "## Rowl Init Snapshot",
    "",
    `- Workspace root: ${path.basename(cwd)}`,
  ];
  if (packageManager) {
    lines.push(`- Package manager: ${packageManager}`);
  }
  if (validationScripts.length > 0) {
    lines.push(
      `- Validation scripts: ${validationScripts
        .map((scriptName) => `${packageManager ?? "npm"} run ${scriptName}`)
        .join(", ")}`,
    );
  }
  if (scriptNames.length > 0) {
    lines.push(`- Root scripts: ${scriptNames.join(", ")}`);
  }
  if (topLevelEntries.length > 0) {
    lines.push(`- Top-level entries: ${topLevelEntries.join(", ")}`);
  }
  if (apps.length > 0 || packages.length > 0) {
    lines.push("", "## Structure");
    if (apps.length > 0) {
      lines.push(`- apps/: ${apps.join(", ")}`);
    }
    if (packages.length > 0) {
      lines.push(`- packages/: ${packages.join(", ")}`);
    }
  }
  lines.push(
    "",
    "## Maintenance",
    "- Keep this file aligned with actual build, test, and workflow conventions.",
    "- Prefer repository scripts and documented workflows over ad-hoc local commands.",
    INIT_SECTION_END,
  );
  return lines.join("\n");
}

function mergeAgentsFileContents(existingContents: string | null, cwd: string): string {
  const managedSection = buildInitManagedSection(cwd);
  if (!existingContents || existingContents.trim().length === 0) {
    return [
      "# AGENTS.md",
      "",
      "This file captures repository-specific instructions for coding agents.",
      "",
      managedSection,
      "",
    ].join("\n");
  }

  const startIndex = existingContents.indexOf(INIT_SECTION_START);
  const endIndex = existingContents.indexOf(INIT_SECTION_END);
  if (startIndex >= 0 && endIndex > startIndex) {
    const before = existingContents.slice(0, startIndex).trimEnd();
    const after = existingContents.slice(endIndex + INIT_SECTION_END.length).trimStart();
    return [before, managedSection, after].filter((part) => part.length > 0).join("\n\n");
  }

  return `${existingContents.trimEnd()}\n\n${managedSection}\n`;
}

function parseFrontmatterSection(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith("---")) {
    throw new Error("Expected YAML frontmatter fenced by ---.");
  }
  const lines = raw.split(/\r?\n/g);
  if (lines[0] !== "---") {
    throw new Error("Frontmatter must start on the first line.");
  }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex < 0) {
    throw new Error("Frontmatter is missing a closing --- line.");
  }
  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines
      .slice(closingIndex + 1)
      .join("\n")
      .trim(),
  };
}

function parseFrontmatterValue(rawValue: string): string | boolean {
  const trimmed = rawValue.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFlatFrontmatter(frontmatter: string): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (const line of frontmatter.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid frontmatter line '${trimmed}'.`);
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1);
    result[key] = parseFrontmatterValue(rawValue);
  }
  return result;
}

function parseCommandTemplate(
  filePath: string,
  cwd: string,
): {
  command: ProjectCommandTemplate | null;
  issue: ProjectCommandTemplateIssue | null;
} {
  const relativePath = path.relative(cwd, filePath).replaceAll(path.sep, "/");
  const raw = safeReadTextFile(filePath);
  if (raw === null) {
    return {
      command: null,
      issue: {
        relativePath,
        message: "Failed to read command template file.",
      },
    };
  }

  try {
    const { frontmatter, body } = parseFrontmatterSection(raw);
    const parsedFrontmatter = parseFlatFrontmatter(frontmatter);
    const command = Schema.decodeUnknownSync(ProjectCommandTemplateSchema)({
      name: path.basename(filePath, path.extname(filePath)),
      relativePath,
      description: parsedFrontmatter.description,
      template: body,
      ...(typeof parsedFrontmatter.provider === "string"
        ? { provider: parsedFrontmatter.provider }
        : {}),
      ...(typeof parsedFrontmatter.model === "string" ? { model: parsedFrontmatter.model } : {}),
      ...(typeof parsedFrontmatter.interactionMode === "string"
        ? { interactionMode: parsedFrontmatter.interactionMode }
        : {}),
      ...(typeof parsedFrontmatter.runtimeMode === "string"
        ? { runtimeMode: parsedFrontmatter.runtimeMode }
        : {}),
      ...(typeof parsedFrontmatter.sendImmediately === "boolean"
        ? { sendImmediately: parsedFrontmatter.sendImmediately }
        : {}),
    });
    return { command, issue: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim() : String(error).trim();
    return {
      command: null,
      issue: {
        relativePath,
        message: detail.length > 0 ? detail : "Invalid command template.",
      },
    };
  }
}

interface ResolvedProjectSkill {
  readonly skill: ProjectSkill;
  readonly contents: string;
}

function parseProjectSkill(
  skillDirectoryPath: string,
  cwd: string,
): {
  skill: ResolvedProjectSkill | null;
  issue: ProjectSkillIssue | null;
} {
  const skillFilePath = path.join(skillDirectoryPath, SKILL_FILE_NAME);
  const relativePath = path.relative(cwd, skillFilePath).replaceAll(path.sep, "/");
  const raw = safeReadTextFile(skillFilePath);
  if (raw === null) {
    return {
      skill: null,
      issue: {
        relativePath,
        message: "Failed to read skill file.",
      },
    };
  }

  try {
    const { frontmatter, body } = parseFrontmatterSection(raw);
    const parsedFrontmatter = parseFlatFrontmatter(frontmatter);
    if (typeof parsedFrontmatter.name !== "string") {
      throw new Error("Skill frontmatter must include a string 'name'.");
    }
    if (typeof parsedFrontmatter.description !== "string") {
      throw new Error("Skill frontmatter must include a string 'description'.");
    }
    const directoryName = path.basename(skillDirectoryPath);
    if (parsedFrontmatter.name !== directoryName) {
      throw new Error("Skill frontmatter 'name' must match the directory name.");
    }
    const skill = Schema.decodeUnknownSync(ProjectSkillSchema)({
      name: parsedFrontmatter.name,
      relativePath,
      description: parsedFrontmatter.description,
    });
    return {
      skill: {
        skill,
        contents: body,
      },
      issue: null,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim() : String(error).trim();
    return {
      skill: null,
      issue: {
        relativePath,
        message: detail.length > 0 ? detail : "Invalid skill.",
      },
    };
  }
}

export function readProjectAgentsFile(input: ProjectAgentsFileInput): ProjectAgentsFileResult {
  const absolutePath = path.join(input.cwd, AGENTS_FILE_NAME);
  const exists = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
  const contents =
    input.includeContents && exists ? (safeReadTextFile(absolutePath) ?? undefined) : undefined;
  return {
    status: exists ? "available" : "missing",
    cwd: input.cwd,
    relativePath: AGENTS_FILE_NAME,
    absolutePath,
    ...(contents !== undefined ? { contents } : {}),
  };
}

export function draftProjectAgentsFile(
  input: ProjectDraftAgentsFileInput,
): ProjectDraftAgentsFileResult {
  const existing = readProjectAgentsFile({ cwd: input.cwd, includeContents: true });
  return {
    cwd: input.cwd,
    relativePath: AGENTS_FILE_NAME,
    absolutePath: existing.absolutePath,
    contents: mergeAgentsFileContents(existing.contents ?? null, input.cwd),
    mode: existing.status === "available" ? "update" : "create",
  };
}

export function listProjectCommandTemplates(
  input: ProjectListCommandTemplatesInput,
): ProjectListCommandTemplatesResult {
  const commandsDirectory = path.join(input.cwd, COMMANDS_DIRECTORY_RELATIVE_PATH);
  let fileNames: string[] = [];
  try {
    fileNames = fs
      .readdirSync(commandsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
      .map((entry) => entry.name)
      .toSorted((left, right) => left.localeCompare(right));
  } catch {
    return {
      commands: [],
      issues: [],
    };
  }

  const commands: ProjectCommandTemplate[] = [];
  const issues: ProjectCommandTemplateIssue[] = [];
  for (const fileName of fileNames) {
    const parsed = parseCommandTemplate(path.join(commandsDirectory, fileName), input.cwd);
    if (parsed.command) {
      commands.push(parsed.command);
    }
    if (parsed.issue) {
      issues.push(parsed.issue);
    }
  }
  return { commands, issues };
}

export function listProjectSkills(input: ProjectListSkillsInput): ProjectListSkillsResult {
  const skillsDirectory = path.join(input.cwd, SKILLS_DIRECTORY_RELATIVE_PATH);
  const skillDirectoryNames = safeReadDirectoryNames(skillsDirectory);
  if (skillDirectoryNames.length === 0) {
    return {
      skills: [],
      issues: [],
    };
  }

  const skills: ProjectSkill[] = [];
  const issues: ProjectSkillIssue[] = [];
  for (const directoryName of skillDirectoryNames) {
    const parsed = parseProjectSkill(path.join(skillsDirectory, directoryName), input.cwd);
    if (parsed.skill) {
      skills.push(parsed.skill.skill);
    }
    if (parsed.issue) {
      issues.push(parsed.issue);
    }
  }

  return { skills, issues };
}

export function resolveProjectSkillSelection(input: {
  readonly cwd: string;
  readonly skillNames: ReadonlyArray<ProjectSkillName>;
}): ReadonlyArray<ResolvedProjectSkill> {
  if (input.skillNames.length === 0) {
    return [];
  }

  const resolvedSkills: ResolvedProjectSkill[] = [];
  const seen = new Set<ProjectSkillName>();
  for (const skillName of input.skillNames) {
    if (seen.has(skillName)) {
      continue;
    }
    seen.add(skillName);
    const parsed = parseProjectSkill(
      path.join(input.cwd, SKILLS_DIRECTORY_RELATIVE_PATH, skillName),
      input.cwd,
    );
    if (parsed.skill) {
      resolvedSkills.push(parsed.skill);
    }
  }

  return resolvedSkills;
}
