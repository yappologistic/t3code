import type { AgentConfig, AgentExit, OutputChunk } from "./agent";
import type { TerminalCommandInput, TerminalCommandResult } from "./terminal";
import type { NewTodoInput, Todo } from "./todo";

export const IPC_CHANNELS = {
  todosList: "todos:list",
  todosAdd: "todos:add",
  todosToggle: "todos:toggle",
  todosRemove: "todos:remove",
  terminalRun: "terminal:run",
  agentSpawn: "agent:spawn",
  agentKill: "agent:kill",
  agentWrite: "agent:write",
  agentOutput: "agent:output",
  agentExit: "agent:exit",
} as const;

export interface NativeApi {
  todos: {
    list: () => Promise<Todo[]>;
    add: (input: NewTodoInput) => Promise<Todo[]>;
    toggle: (id: string) => Promise<Todo[]>;
    remove: (id: string) => Promise<Todo[]>;
  };
  terminal: {
    run: (input: TerminalCommandInput) => Promise<TerminalCommandResult>;
  };
  agent: {
    spawn: (config: AgentConfig) => Promise<string>;
    kill: (sessionId: string) => Promise<void>;
    write: (sessionId: string, data: string) => Promise<void>;
    onOutput: (callback: (chunk: OutputChunk) => void) => () => void;
    onExit: (callback: (exit: AgentExit) => void) => () => void;
  };
}
