import { describe, expect, it, vi } from "vitest";

import { ProviderManager } from "./providerManager";

describe("ProviderManager", () => {
  it("detaches provider event listener and ends thread log streams on dispose", () => {
    const manager = new ProviderManager();
    const internals = manager as unknown as {
      codex: { listenerCount: (event: string) => number };
      onCodexEvent: (event: {
        id: string;
        kind: "notification";
        provider: "codex";
        sessionId: string;
        createdAt: string;
        method: string;
        threadId: string;
      }) => void;
      threadLogStreams: Map<string, { writableEnded: boolean; destroyed: boolean }>;
    };
    internals.onCodexEvent({
      id: "evt-1",
      kind: "notification",
      provider: "codex",
      sessionId: "sess-1",
      createdAt: new Date().toISOString(),
      method: "thread/started",
      threadId: "thread-1",
    });
    const stream = internals.threadLogStreams.get("thread-1");
    expect(stream).toBeDefined();
    if (!stream) return;

    expect(internals.codex.listenerCount("event")).toBe(1);
    manager.dispose();

    expect(internals.codex.listenerCount("event")).toBe(0);
    expect(stream.writableEnded || stream.destroyed).toBe(true);
    expect(internals.threadLogStreams.size).toBe(0);
  });

  it("allows multiple dispose calls", () => {
    const manager = new ProviderManager();

    manager.dispose();
    expect(() => manager.dispose()).not.toThrow();
  });

  it("rejects request responses for unknown sessions", async () => {
    const manager = new ProviderManager();

    await expect(
      manager.respondToRequest({
        sessionId: "missing-session",
        requestId: "req-1",
        decision: "accept",
      }),
    ).rejects.toThrow("Unknown provider session: missing-session");

    manager.dispose();
  });

  it("rejects checkpoint operations for unknown sessions", async () => {
    const manager = new ProviderManager();

    await expect(
      manager.listCheckpoints({
        sessionId: "missing-session",
      }),
    ).rejects.toThrow("Unknown provider session: missing-session");

    await expect(
      manager.revertToCheckpoint({
        sessionId: "missing-session",
        turnCount: 0,
      }),
    ).rejects.toThrow("Unknown provider session: missing-session");

    manager.dispose();
  });

  it("derives checkpoints from thread turns", async () => {
    const manager = new ProviderManager();
    const codex = (
      manager as unknown as {
        codex: {
          hasSession: (sessionId: string) => boolean;
          readThread: (sessionId: string) => Promise<{
            threadId: string;
            turns: Array<{ id: string; items: unknown[] }>;
          }>;
        };
      }
    ).codex;

    codex.hasSession = () => true;
    codex.readThread = async () => ({
      threadId: "thr_1",
      turns: [
        {
          id: "turn_1",
          items: [
            {
              type: "userMessage",
              content: [{ type: "text", text: "Refactor the logger" }],
            },
            {
              type: "agentMessage",
              text: "I refactored it.",
            },
          ],
        },
      ],
    });

    const result = await manager.listCheckpoints({
      sessionId: "sess_1",
    });

    expect(result).toEqual({
      threadId: "thr_1",
      checkpoints: [
        {
          id: "root",
          turnCount: 0,
          messageCount: 0,
          label: "Start of conversation",
          isCurrent: false,
        },
        {
          id: "turn_1",
          turnCount: 1,
          messageCount: 2,
          label: "Turn 1",
          preview: "Refactor the logger",
          isCurrent: true,
        },
      ],
    });

    manager.dispose();
  });

  it("rolls back from a selected checkpoint turn count", async () => {
    const manager = new ProviderManager();
    const codex = (
      manager as unknown as {
        codex: {
          hasSession: (sessionId: string) => boolean;
          readThread: (sessionId: string) => Promise<{
            threadId: string;
            turns: Array<{ id: string; items: unknown[] }>;
          }>;
          rollbackThread: (sessionId: string, numTurns: number) => Promise<{
            threadId: string;
            turns: Array<{ id: string; items: unknown[] }>;
          }>;
        };
      }
    ).codex;

    const rollbackCalls: Array<{ sessionId: string; numTurns: number }> = [];
    codex.hasSession = () => true;
    codex.readThread = async () => ({
      threadId: "thr_1",
      turns: [
        { id: "turn_1", items: [] },
        { id: "turn_2", items: [] },
        { id: "turn_3", items: [] },
      ],
    });
    codex.rollbackThread = async (sessionId, numTurns) => {
      rollbackCalls.push({ sessionId, numTurns });
      return {
        threadId: "thr_1",
        turns: [{ id: "turn_1", items: [] }],
      };
    };

    const result = await manager.revertToCheckpoint({
      sessionId: "sess_1",
      turnCount: 1,
    });

    expect(rollbackCalls).toEqual([{ sessionId: "sess_1", numTurns: 2 }]);
    expect(result.threadId).toBe("thr_1");
    expect(result.turnCount).toBe(1);
    expect(result.messageCount).toBe(0);
    expect(result.rolledBackTurns).toBe(2);
    expect(result.checkpoints).toHaveLength(2);

    manager.dispose();
  });

  it("restores filesystem checkpoint when reverting and checkpointing is enabled", async () => {
    const manager = new ProviderManager();
    const internals = manager as unknown as {
      codex: {
        hasSession: (sessionId: string) => boolean;
        readThread: (sessionId: string) => Promise<{
          threadId: string;
          turns: Array<{ id: string; items: unknown[] }>;
        }>;
        rollbackThread: (sessionId: string, numTurns: number) => Promise<{
          threadId: string;
          turns: Array<{ id: string; items: unknown[] }>;
        }>;
      };
      filesystemCheckpointStore: {
        hasCheckpoint: (input: { cwd: string; threadId: string; turnCount: number }) => Promise<boolean>;
        restoreCheckpoint: (input: {
          cwd: string;
          threadId: string;
          turnCount: number;
        }) => Promise<boolean>;
        pruneAfterTurn: (input: { cwd: string; threadId: string; maxTurnCount: number }) => Promise<void>;
      };
      sessionCheckpointCwds: Map<string, string>;
    };

    internals.codex.hasSession = () => true;
    internals.codex.readThread = async () => ({
      threadId: "thr_1",
      turns: [
        { id: "turn_1", items: [] },
        { id: "turn_2", items: [] },
      ],
    });
    internals.codex.rollbackThread = async () => ({
      threadId: "thr_1",
      turns: [{ id: "turn_1", items: [] }],
    });
    const hasCheckpoint = vi.fn(async () => true);
    const restoreCheckpoint = vi.fn(async () => true);
    const pruneAfterTurn = vi.fn(async () => undefined);
    internals.filesystemCheckpointStore.hasCheckpoint = hasCheckpoint;
    internals.filesystemCheckpointStore.restoreCheckpoint = restoreCheckpoint;
    internals.filesystemCheckpointStore.pruneAfterTurn = pruneAfterTurn;
    internals.sessionCheckpointCwds.set("sess_1", "/repo");

    const result = await manager.revertToCheckpoint({
      sessionId: "sess_1",
      turnCount: 1,
    });

    expect(result.turnCount).toBe(1);
    expect(hasCheckpoint).toHaveBeenCalledWith({
      cwd: "/repo",
      threadId: "thr_1",
      turnCount: 1,
    });
    expect(restoreCheckpoint).toHaveBeenCalledWith({
      cwd: "/repo",
      threadId: "thr_1",
      turnCount: 1,
    });
    expect(pruneAfterTurn).toHaveBeenCalledWith({
      cwd: "/repo",
      threadId: "thr_1",
      maxTurnCount: 1,
    });

    manager.dispose();
  });

  it("fails before rollback when filesystem checkpoint is missing", async () => {
    const manager = new ProviderManager();
    const internals = manager as unknown as {
      codex: {
        hasSession: (sessionId: string) => boolean;
        readThread: (sessionId: string) => Promise<{
          threadId: string;
          turns: Array<{ id: string; items: unknown[] }>;
        }>;
        rollbackThread: (sessionId: string, numTurns: number) => Promise<{
          threadId: string;
          turns: Array<{ id: string; items: unknown[] }>;
        }>;
      };
      filesystemCheckpointStore: {
        hasCheckpoint: (input: { cwd: string; threadId: string; turnCount: number }) => Promise<boolean>;
      };
      sessionCheckpointCwds: Map<string, string>;
    };

    const rollbackSpy = vi.fn(async () => ({
      threadId: "thr_1",
      turns: [{ id: "turn_1", items: [] }],
    }));

    internals.codex.hasSession = () => true;
    internals.codex.readThread = async () => ({
      threadId: "thr_1",
      turns: [
        { id: "turn_1", items: [] },
        { id: "turn_2", items: [] },
      ],
    });
    internals.codex.rollbackThread = rollbackSpy;
    internals.filesystemCheckpointStore.hasCheckpoint = async () => false;
    internals.sessionCheckpointCwds.set("sess_1", "/repo");

    await expect(
      manager.revertToCheckpoint({
        sessionId: "sess_1",
        turnCount: 1,
      }),
    ).rejects.toThrow("Filesystem checkpoint is unavailable for turn 1 in thread thr_1.");
    expect(rollbackSpy).not.toHaveBeenCalled();

    manager.dispose();
  });
});
