import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { Sidebar, SidebarProvider, SidebarTrigger, useSidebar } from "./sidebar";

type SidebarStateValue = "expanded" | "collapsed";

function SidebarStateProbe() {
  const { state } = useSidebar();

  return <output data-testid="sidebar-state">{state}</output>;
}

function SidebarHarness({ keyboardShortcut = false }: { keyboardShortcut?: boolean }) {
  return (
    <div className="fixed inset-0 overflow-hidden">
      <SidebarProvider {...(keyboardShortcut ? { keyboardShortcut: "b" } : {})} defaultOpen>
        <Sidebar
          side="left"
          collapsible="offcanvas"
          className="border-r border-border bg-card text-foreground"
        >
          <div className="p-4 text-sm font-medium text-foreground">Threads</div>
        </Sidebar>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
          <SidebarTrigger />
          <SidebarStateProbe />
        </main>
      </SidebarProvider>
    </div>
  );
}

async function mountSidebar(options: { keyboardShortcut: boolean } = { keyboardShortcut: false }) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.width = "100vw";
  host.style.height = "100vh";
  host.style.overflow = "hidden";
  document.body.append(host);

  const screen = await render(<SidebarHarness keyboardShortcut={options.keyboardShortcut} />, {
    container: host,
  });

  return {
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  };
}

async function waitForSidebarTrigger(): Promise<HTMLButtonElement> {
  await vi.waitFor(
    () => {
      expect(document.querySelector("[data-slot='sidebar-trigger']")).not.toBeNull();
    },
    { timeout: 4_000, interval: 16 },
  );

  return document.querySelector("[data-slot='sidebar-trigger']") as HTMLButtonElement;
}

async function waitForSidebarState(state: SidebarStateValue): Promise<void> {
  await vi.waitFor(
    () => {
      expect(document.querySelector("[data-testid='sidebar-state']")?.textContent).toBe(state);
    },
    { timeout: 4_000, interval: 16 },
  );
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 50);
  });
}

describe("SidebarTrigger", () => {
  beforeEach(async () => {
    await page.viewport(1280, 900);
    document.body.innerHTML = "";
    vi.stubGlobal("cookieStore", {
      set: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("toggles the desktop sidebar from the header trigger", async () => {
    const mounted = await mountSidebar();

    try {
      const trigger = await waitForSidebarTrigger();
      await waitForSidebarState("expanded");
      expect(trigger.title).toBe("Toggle sidebar");
      expect(trigger.getAttribute("aria-label")).toBe("Collapse sidebar");

      trigger.click();
      await waitForSidebarState("collapsed");
      expect(trigger.getAttribute("aria-label")).toBe("Expand sidebar");

      trigger.click();
      await waitForSidebarState("expanded");
      expect(trigger.getAttribute("aria-label")).toBe("Collapse sidebar");
    } finally {
      await mounted.cleanup();
    }
  });

  it("supports the configured Ctrl+B sidebar shortcut on desktop", async () => {
    const mounted = await mountSidebar({ keyboardShortcut: true });

    try {
      const trigger = await waitForSidebarTrigger();
      await waitForSidebarState("expanded");
      expect(trigger.title).toContain("Ctrl+B");

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "b",
          bubbles: true,
          cancelable: true,
        }),
      );
      await settle();
      expect(document.querySelector("[data-testid='sidebar-state']")?.textContent).toBe("expanded");

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "b",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await waitForSidebarState("collapsed");

      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "b",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      await waitForSidebarState("expanded");
    } finally {
      await mounted.cleanup();
    }
  });
});
