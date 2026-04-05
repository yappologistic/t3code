# ROWL: The Agentic Engineering Control Room

## Vision Document

---

## The Problem with Current AI Coding Tools

Most AI coding tools treat AI as a faster autocomplete. You get a single chat, a single model, a single project context, and a single thread of conversation. When it goes off the rails, you start over. When context runs out, you're lost. When the AI "forgets" what it can do, you're stuck.

This is not how humans work. This is not how creative work happens. This is not how engineering teams operate.

**The problem isn't the AI. The problem is the interface between human and AI.**

---

## The Vision: Rowl as an Agentic Engineering Control Room

Rowl is not a "launcher for coding models." Rowl is a **control room for agentic engineering**.

Just like a recording studio has:

- Multiple tracks running simultaneously
- Visual feedback on every input/output
- The ability to record, review, and overdub
- Mixers that give you precise control over each element
- Sessions that can be saved, branched, and revisited

Rowl gives you the same control over AI agents:

- **Multiple providers** running simultaneously (Claude Code, Codex, Copilot, OpenCode, custom models)
- **Multiple projects** with clear boundaries and shared contexts
- **Multiple agents** working in parallel on different aspects of a problem
- **Visibility** into exactly what every agent is doing, thinking, and producing
- **Control** over context, permissions, workflows, and outputs
- **Review systems** for approving, rejecting, or modifying AI-generated work
- **Structured application** of AI outputs with full audit trails

This is fundamentally different from "one chat with one model."

---

## Core Philosophy: Vibe Coding

The name "Rowl" captures the feeling we want: relaxed, confident, in control. This is the **vibe coding** philosophy.

### What is Vibe Coding?

Vibe coding is a term that captures how Valo and now Rowl approach AI-assisted engineering. It's not about letting AI do everything (that's just delegation). It's not about reviewing every line (that's just pair programming with extra steps). It's about a fundamentally different relationship between human intent and AI execution.

**Key principles:**

1. **Humans are Notice-ers, Not Coders**

   The most powerful skill in a vibe-coded workflow is not knowing how to code. It's knowing _what you want_. The human acts as the strategic observer—the one who notices when something feels right, when something is off, when the direction needs to shift.

   Non-coders often have an advantage here because they don't get caught up in implementation details. They see the _outcome_ rather than the _method_.

2. **Context is Everything**

   The quality of AI output is 90% context. Give an AI 10 lines of perfect context and it will outperform an AI given 10,000 lines of poorly organized context.

   This is why Rowl's context management is surgical, not surgical-ish. We don't just compress or summarize. We **trim with precision**, leaving markers (tombstones) so you can always see what was removed and why.

3. **Single Focused Chat > Many Scattered Chats**

   Context fragmentation is the enemy of good AI work. When you have 15 different chat windows, you have 15 different partial contexts, none of which know what the other is doing.

   Rowl's philosophy: **one focused thread per task**, with clear relationships to other threads. Not scattered conversations, but organized sessions with full history and context.

4. **The "Why" Matters More Than the "How"**

   Traditional coding is about specifying _how_ to do something. Vibe coding is about communicating _why_ something matters.

   When you tell an AI "I want this button to feel responsive and fast," you're giving it more to work with than "add a loading state." The AI can infer the intent, the aesthetic, the user experience goal. The "how" becomes negotiable; the "why" is fixed.

5. **AI Should Know What It Can Do**

   Claude, GPT, and other frontier models are trained on code, but they're trained on _descriptions_ of code, not necessarily on the full scope of their own capabilities in coding contexts. They can "forget" what tools they have access to. They can undersell their own abilities.

   This is why Rowl implements a **Guardian System**: a lightweight background process that watches what the AI is saying and gently reminds it of capabilities it might be forgetting. Not as a constraint, but as a memory.

---

## Multi-Provider: The Fulfillment of Pluralsight for AI

In traditional software, we don't ask "which cloud provider?" We use multiple providers because different tools excel at different things. AWS for infrastructure, Stripe for payments, Twilio for communications.

**AI is the same.**

- Claude excels at reasoning, nuance, and long-context tasks
- Codex excels at fast execution and GitHub integration
- Copilot excels at context-aware autocomplete
- OpenCode brings OpenRouter aggregation and unique MCP capabilities
- Kimi brings Chinese language and market capabilities
- Pi brings lightweight, fast iteration

No single provider is "the best." The best setup is **the right provider for the right task**, which means you need a workspace that can:

1. **Route tasks intelligently** to the most appropriate provider
2. **Maintain context across providers** when a task spans multiple
3. **Compare outputs** from different providers on the same problem
4. **Orchestrate multiple providers** in parallel on complex tasks

Rowl is the fulfillment of this vision: a unified workspace where you can spin up any provider, any time, with full context preservation.

---

## Multi-Project: Engineering at the Portfolio Level

Professional engineers don't work on one project at a time. They maintain multiple projects, libraries, and systems simultaneously. They need to context-switch between projects without losing their mental model of each.

**Current AI tools assume one project at a time.** Start a new chat, lose the old context. Work on Project A, have no idea what you were doing in Project B.

Rowl's multi-project architecture treats your engineering portfolio as a first-class concept:

- Each project has its own context, providers, and history
- Projects can share context when needed (shared libraries, monorepo structure)
- You can work on Project A, queue work on Project B, and monitor Project C—all in the same interface
- Thread history is preserved, searchable, and forkable across projects

This is how actual engineering teams work. Why should AI tools pretend otherwise?

---

## Simultaneous Agents: Parallel Intelligence

The most powerful engineering teams don't have one engineer doing everything sequentially. They have multiple engineers working in parallel, with clear responsibilities, shared context, and communication protocols.

**Rowl brings this to AI agents.**

In Rowl, you can have:

- An agent researching approach options
- An agent implementing core features
- An agent writing tests
- An agent reviewing the work

All running simultaneously, all with access to the same project context, all coordinated through structured review and approval workflows.

This isn't science fiction. This is what happens when you have proper:

- **Context isolation** (agents don't step on each other's context)
- **Process isolation** (agents can crash without taking down the whole system)
- **Output structured review** (agent work goes into a review queue, not directly into your codebase)

---

## Visibility: The Dashboard Principle

When you fly a plane, you don't just trust the pilot's word that everything is fine. You have instruments that show altitude, speed, heading, fuel, engine status. The pilot has agency, but you can see what's happening.

**Rowl applies the dashboard principle to AI agents.**

In Rowl, you can see:

- What each agent is currently working on
- How much context each agent is using
- What tools each agent has called
- What the agent is "thinking" (when reasoning is enabled)
- How far along each task is
- What approvals are pending

This visibility does two things:

1. **Builds trust** — you can see that the AI is actually working
2. **Enables intervention** — you can catch problems before they become disasters

---

## Control: Context, Permissions, Workflows

Visibility without control is just surveillance. Rowl gives you real control:

### Context Control

- **Surgical trimming** with tombstones (visible markers showing what was removed)
- **Context budgets** per agent, per project, per session
- **Selective context injection** from other threads, projects, or external sources
- **Context preservation** on interrupt/restart

### Permission Control

- **Allow/Ask/Deny policies** per tool category
- **Per-provider permission profiles**
- **Approval queues** for sensitive operations
- **Audit trails** of all approved/denied operations

### Workflow Control

- **Plan mode** for structured first-draft review
- **Apply/Review/Reject** workflows for agent outputs
- **Checkpointing** before and after major changes
- **Rollback** to any previous checkpoint

---

## Content Mediums: Beyond Code

Rowl starts with code because that's where AI-assisted engineering is most mature. But the vision extends beyond code.

**Future Rowl:**

### Video Workflow Canvas

Inspired by Flashboards, Rowl will support video projects as first-class citizens:

- AI-generated video content
- AI-assisted editing and composition
- Video assets in the same project as code
- Unified review and approval across media types

### Image and Design Workflow

With tools like Flora demonstrating AI image generation, Rowl will integrate:

- Image generation and editing
- Design asset management
- Visual content alongside code deliverables
- Cross-medium context (e.g., "generate UI mockup, then implement it in code")

### Document and Knowledge Work

Technical documentation, architecture decision records, RFCs—all part of the engineering workflow. Rowl will treat these as first-class outputs, not afterthoughts.

**The key insight:** Code, video, images, and documents are all _engineering outputs_. They should live in the same workspace, share context, and be subject to the same review and approval workflows.

---

## Why This Matters: The Meta-Argument

You might ask: "Why build all this? Aren't existing tools good enough?"

The answer is **no, they are not good enough**, and here's why:

### The Context Problem

When AI tools run out of context, they don't gracefully degrade. They silently start forgetting things. You don't find out until the output is wrong, incomplete, or incoherent. This is a trust problem.

### The Single-Provider Problem

Different AI providers have different strengths. Locking into one provider means you're always using the second-best tool for some portion of your work. This is an efficiency problem.

### The Visibility Problem

Most AI tools give you output. They don't tell you _how_ they arrived at that output, _what_ they considered and rejected, or _what_ they're uncertain about. This is a reliability problem.

### The Review Problem

AI outputs go directly from generation to acceptance or rejection. There's no structured review, no comparison of alternatives, no audit trail. This is a quality problem.

### The Medium Problem

Code, video, images, documents—they're all engineering artifacts. Treating them as separate domains means context can't flow between them. This is an integration problem.

**Rowl addresses all five problems.** It is not a better chatbot. It is a better _way of working with AI_.

---

## The Name: Why "Rowl"

A "rowl" is a low, rough, rumbling sound—like a cat purring, or the quiet satisfaction of work well done.

Rowl captures the vibe:

- **Relaxed** — You are in control, not the AI
- **Confident** — You can see what's happening and intervene when needed
- **Productive** — Multiple agents, parallel work, structured review

Not "loud" like many AI tools that demand attention with notifications and urgency. **Quiet, steady, in control.**

---

## Summary: What Rowl Is and Isn't

**Rowl IS:**

- A multi-provider AI orchestration workspace
- A multi-project context management system
- A simultaneous multi-agent coordination platform
- A visual control room with full visibility
- A structured review and approval workflow system
- A vibe-coded environment where humans notice and direct

**Rowl IS NOT:**

- A single-chat AI assistant
- A code-only tool (future: video, images, documents)
- A passive recipient of AI output
- A context-unaware automation system
- A one-provider solution

---

## The North Star

Rowl's north star is simple:

> **Make AI-assisted engineering feel like conducting an orchestra, not operating a typewriter.**

You have many instruments. You can play them simultaneously or in sequence. You can see all of them at once. You can adjust volume, tempo, and direction in real-time. You can save and revisit arrangements. You can collaborate with other conductors.

This is what Rowl is building toward.

---

_Version 1.0 — Initial Vision Document_
_Last updated: Based on Valo transcript analysis and Rowl codebase review_
