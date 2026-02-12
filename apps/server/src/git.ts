import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  GitCheckoutInput,
  GitCreateBranchInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitRemoveWorktreeInput,
} from "@t3tools/contracts";

export interface TerminalCommandInput {
  command: string;
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface TerminalCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

const DEFAULT_MAX_OUTPUT_BYTES = 1_000_000;

function appendChunkWithinLimit(
  target: string,
  currentBytes: number,
  chunk: Buffer,
  maxBytes: number,
): {
  next: string;
  nextBytes: number;
  truncated: boolean;
} {
  const remaining = maxBytes - currentBytes;
  if (remaining <= 0) {
    return { next: target, nextBytes: currentBytes, truncated: true };
  }
  if (chunk.length <= remaining) {
    return {
      next: `${target}${chunk.toString()}`,
      nextBytes: currentBytes + chunk.length,
      truncated: false,
    };
  }
  return {
    next: `${target}${chunk.subarray(0, remaining).toString()}`,
    nextBytes: currentBytes + remaining,
    truncated: true,
  };
}

/** Spawn git directly with an argv array — no shell, no quoting needed. */
function runGit(args: string[], cwd: string, timeoutMs = 30_000): Promise<TerminalCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES;
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputTruncated = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1_000).unref();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      const appended = appendChunkWithinLimit(stdout, stdoutBytes, chunk, maxOutputBytes);
      stdout = appended.next;
      stdoutBytes = appended.nextBytes;
      outputTruncated = outputTruncated || appended.truncated;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const appended = appendChunkWithinLimit(stderr, stderrBytes, chunk, maxOutputBytes);
      stderr = appended.next;
      stderrBytes = appended.nextBytes;
      outputTruncated = outputTruncated || appended.truncated;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (outputTruncated) {
        stderr = `${stderr}\n[output truncated at ${maxOutputBytes} bytes]`;
      }
      resolve({ stdout, stderr, code: code ?? null, signal: signal ?? null, timedOut });
    });
  });
}

export async function runTerminalCommand(
  input: TerminalCommandInput,
): Promise<TerminalCommandResult> {
  const maxOutputBytes = input.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const shellPath =
    process.platform === "win32"
      ? (process.env.ComSpec ?? "cmd.exe")
      : (process.env.SHELL ?? "/bin/sh");

  const args =
    process.platform === "win32" ? ["/d", "/s", "/c", input.command] : ["-lc", input.command];

  return new Promise((resolve, reject) => {
    const child = spawn(shellPath, args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputTruncated = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 1_000).unref();
    }, input.timeoutMs ?? 30_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      const appended = appendChunkWithinLimit(stdout, stdoutBytes, chunk, maxOutputBytes);
      stdout = appended.next;
      stdoutBytes = appended.nextBytes;
      outputTruncated = outputTruncated || appended.truncated;
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const appended = appendChunkWithinLimit(stderr, stderrBytes, chunk, maxOutputBytes);
      stderr = appended.next;
      stderrBytes = appended.nextBytes;
      outputTruncated = outputTruncated || appended.truncated;
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (outputTruncated) {
        stderr = `${stderr}\n[output truncated at ${maxOutputBytes} bytes]`;
      }
      resolve({
        stdout,
        stderr,
        code: code ?? null,
        signal: signal ?? null,
        timedOut,
      });
    });
  });
}

export async function listGitBranches(input: GitListBranchesInput): Promise<GitListBranchesResult> {
  const result = await runGit(["branch", "--no-color"], input.cwd, 10_000);

  if (result.code !== 0) {
    const stderr = result.stderr.trim();
    if (stderr.includes("not a git repository")) {
      return { branches: [], isRepo: false };
    }
    throw new Error(stderr || "git branch failed");
  }

  // Resolve the real default branch from the remote
  const [defaultRef, worktreeList] = await Promise.all([
    runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], input.cwd, 5_000),
    runGit(["worktree", "list", "--porcelain"], input.cwd, 5_000),
  ]);
  const defaultBranch =
    defaultRef.code === 0 ? defaultRef.stdout.trim().replace(/^refs\/remotes\/origin\//, "") : null;

  // Build branch-name → worktree-path map from porcelain output.
  // Only include worktrees whose directories still exist on disk (skip prunable/stale ones).
  const worktreeMap = new Map<string, string>();
  if (worktreeList.code === 0) {
    let currentPath: string | null = null;
    for (const line of worktreeList.stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        const candidatePath = line.slice("worktree ".length);
        currentPath = fs.existsSync(candidatePath) ? candidatePath : null;
      } else if (line.startsWith("branch refs/heads/") && currentPath) {
        worktreeMap.set(line.slice("branch refs/heads/".length), currentPath);
      } else if (line === "") {
        currentPath = null;
      }
    }
  }

  const branches = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const name = line.replace(/^[*+]\s+/, "");
      return {
        name,
        current: line.startsWith("* "),
        isDefault: name === defaultBranch,
        worktreePath: worktreeMap.get(name) ?? null,
      };
    })
    .toSorted((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return { branches, isRepo: true };
}

export async function createGitWorktree(
  input: GitCreateWorktreeInput,
): Promise<GitCreateWorktreeResult> {
  const sanitizedBranch = input.newBranch.replace(/\//g, "-");
  const repoName = path.basename(input.cwd);
  const worktreePath =
    input.path ?? path.join(os.homedir(), ".t3", "worktrees", repoName, sanitizedBranch);

  // Create a new branch from the base branch in a new worktree
  const result = await runGit(
    ["worktree", "add", "-b", input.newBranch, worktreePath, input.branch],
    input.cwd,
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "git worktree add failed");
  }

  return {
    worktree: {
      path: worktreePath,
      branch: input.newBranch,
    },
  };
}

export async function removeGitWorktree(input: GitRemoveWorktreeInput): Promise<void> {
  const result = await runGit(["worktree", "remove", input.path], input.cwd, 15_000);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "git worktree remove failed");
  }
}

export async function createGitBranch(input: GitCreateBranchInput): Promise<void> {
  const result = await runGit(["branch", input.branch], input.cwd, 10_000);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "git branch create failed");
  }
}

export async function checkoutGitBranch(input: GitCheckoutInput): Promise<void> {
  const result = await runGit(["checkout", input.branch], input.cwd, 10_000);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "git checkout failed");
  }
}

export async function initGitRepo(input: GitInitInput): Promise<void> {
  const result = await runGit(["init"], input.cwd, 10_000);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || "git init failed");
  }
}
