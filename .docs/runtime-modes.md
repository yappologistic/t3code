# Runtime modes

CUT3 has a global runtime mode switch in the chat toolbar:

- **Full access** (default): starts sessions with `approvalPolicy: never` and `sandboxMode: danger-full-access`.
- **Supervised**: starts sessions with `approvalPolicy: on-request` and `sandboxMode: workspace-write`, then prompts in-app for command/file approvals.

Runtime mode sets the default sandbox and approval posture for a new session. Persistent permission policies from Settings can still auto-allow, ask, or deny specific requests after the provider raises an approval. Pi is the one notable difference here: CUT3 still gates Pi tools through the same approval UX in `Supervised`, but Pi does not add a separate OS sandbox beyond its own embedded tool execution.

## Interaction modes

The chat toolbar also has an interaction-mode toggle:

- **Chat**: the normal execution mode.
- **Plan**: switches the provider into plan-first collaboration so the assistant focuses on exploration, clarification, and producing a detailed plan instead of directly executing the work. For Pi, CUT3 enforces a read-only Pi tool set plus explicit plan instructions because Pi does not expose a separate native plan-mode protocol.

When a plan is active, CUT3 can also show a **plan sidebar** so the current plan stays visible while you continue the conversation.

The plan sidebar also supports:

- copying the current plan to the clipboard
- downloading the plan as markdown
- saving the plan into the current workspace

## Thread controls

The thread surface also exposes history and collaboration controls that build on top of runtime mode:

- **Share / Revoke**: create or revoke a read-only shared snapshot. Shared links open in a dedicated route that can import the snapshot into another local project.
- **Compact thread**: write a continuation-summary boundary so the thread can keep going with a smaller context footprint.
- **Undo / Redo**: move through recent restore snapshots without manually selecting checkpoints.
- **Fork / Export**: keep the existing fork and export controls from the thread actions menu, message actions, and diff panel.

These controls are also reachable from the composer with built-in slash commands such as `/share`, `/unshare`, `/compact`, `/undo`, `/redo`, `/export`, and `/details`.

## Sharing modes

Settings also controls how new share links behave:

- **Manual**: create share links only when you explicitly choose `/share` or the thread action.
- **Auto**: create a share link automatically after a new server-backed thread settles for the first time.
- **Disabled**: block creation of new share links from CUT3 until you change the setting again.
