import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS, type NativeApi } from "@acme/contracts";

const nativeApi: NativeApi = {
  todos: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.todosList),
    add: (input) => ipcRenderer.invoke(IPC_CHANNELS.todosAdd, input),
    toggle: (id) => ipcRenderer.invoke(IPC_CHANNELS.todosToggle, id),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.todosRemove, id),
  },
  terminal: {
    run: (input) => ipcRenderer.invoke(IPC_CHANNELS.terminalRun, input),
  },
  agent: {
    spawn: (config) => ipcRenderer.invoke(IPC_CHANNELS.agentSpawn, config),
    kill: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.agentKill, sessionId),
    write: (sessionId, data) =>
      ipcRenderer.invoke(IPC_CHANNELS.agentWrite, sessionId, data),
    onOutput: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, chunk: unknown) =>
        callback(chunk as Parameters<typeof callback>[0]);
      ipcRenderer.on(IPC_CHANNELS.agentOutput, listener);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.agentOutput, listener);
    },
    onExit: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, exit: unknown) =>
        callback(exit as Parameters<typeof callback>[0]);
      ipcRenderer.on(IPC_CHANNELS.agentExit, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.agentExit, listener);
    },
  },
};

contextBridge.exposeInMainWorld("nativeApi", nativeApi);
