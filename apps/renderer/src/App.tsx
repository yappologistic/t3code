import { type FormEvent, useMemo, useState } from "react";

import type { TerminalCommandResult } from "@acme/contracts";

interface TerminalEntry {
  id: string;
  command: string;
  result: TerminalCommandResult;
  createdAt: string;
}

function formatTimestamp(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(isoDate));
}

function readNativeApi() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.nativeApi;
}

export default function App() {
  const api = useMemo(() => readNativeApi(), []);
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<TerminalEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!api || isRunning) {
      return;
    }

    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    setError(null);
    setIsRunning(true);

    try {
      const result = await api.terminal.run({ command: trimmed });
      setHistory((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          command: trimmed,
          result,
          createdAt: new Date().toISOString(),
        },
      ]);
      setCommand("");
    } catch (runError) {
      const message =
        runError instanceof Error
          ? runError.message
          : "Could not execute command.";
      setError(message);
    } finally {
      setIsRunning(false);
    }
  };

  if (!api) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-8">
        <section className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-amber-900 shadow-soft">
          <h1 className="text-lg font-semibold">Native bridge unavailable</h1>
          <p className="mt-2 text-sm">
            Launch this UI through Electron so the preload API is available.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10 text-slate-900 sm:px-10">
      <header className="rounded-3xl border border-slate-800/80 bg-slate-900 p-7 text-slate-100 shadow-soft">
        <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
          Demo Terminal
        </p>
        <h1 className="mt-2 font-mono text-3xl font-semibold tracking-tight">
          Shell Command Runner
        </h1>
        <p className="mt-3 text-sm text-slate-300">
          Runs one command at a time in your shell and prints stdout/stderr.
        </p>

        <form className="mt-6 flex gap-3" onSubmit={onSubmit}>
          <input
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="e.g. ls -la"
            className="h-11 flex-1 rounded-xl border border-emerald-500/50 bg-slate-950 px-4 font-mono text-sm text-emerald-100 outline-none ring-0 transition focus:border-emerald-300"
            maxLength={4000}
          />
          <button
            type="submit"
            className="h-11 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:text-emerald-300"
            disabled={isRunning}
          >
            {isRunning ? "Running..." : "Run"}
          </button>
          <button
            type="button"
            className="h-11 rounded-xl border border-slate-600 px-5 text-sm font-medium text-slate-200 transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={history.length === 0 || isRunning}
            onClick={() => setHistory([])}
          >
            Clear
          </button>
        </form>
      </header>

      {error ? (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="mt-6 flex-1 space-y-4">
        {history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No commands run yet.
          </div>
        ) : null}

        {history.map((entry) => (
          <article
            key={entry.id}
            className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-soft"
          >
            <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 font-mono text-xs text-slate-300">
              <p>$ {entry.command}</p>
              <p>{formatTimestamp(entry.createdAt)}</p>
            </header>

            <div className="space-y-3 px-4 py-4 font-mono text-sm">
              {entry.result.stdout ? (
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-emerald-300">
                    stdout
                  </p>
                  <pre className="whitespace-pre-wrap break-words text-emerald-100">
                    {entry.result.stdout}
                  </pre>
                </div>
              ) : null}

              {entry.result.stderr ? (
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-rose-300">
                    stderr
                  </p>
                  <pre className="whitespace-pre-wrap break-words text-rose-200">
                    {entry.result.stderr}
                  </pre>
                </div>
              ) : null}

              {!entry.result.stdout && !entry.result.stderr ? (
                <p className="text-slate-400">(no output)</p>
              ) : null}
            </div>

            <footer className="border-t border-slate-800 bg-slate-900/60 px-4 py-2 font-mono text-xs text-slate-400">
              exit={entry.result.code ?? "null"} signal=
              {entry.result.signal ?? "null"} timedOut=
              {entry.result.timedOut ? "yes" : "no"}
            </footer>
          </article>
        ))}
      </section>
    </main>
  );
}
