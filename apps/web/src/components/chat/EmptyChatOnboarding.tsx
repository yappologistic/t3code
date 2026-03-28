import { FolderIcon, MessageSquarePlusIcon } from "lucide-react";
import { useMemo, useRef } from "react";

import { useAppSettings } from "../../appSettings";
import { isElectron } from "../../env";
import { useProjectCreationActions } from "../../hooks/useProjectCreationActions";
import { useNewThreadActions } from "../../hooks/useNewThread";
import { useStore } from "../../store";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

function getEmptyChatOnboardingCopy(language: "en" | "fa") {
  if (language === "fa") {
    return {
      loadingTitle: "در حال آماده سازی پروژه ها...",
      loadingDescription: "CUT3 در حال همگام سازی فضای کاری محلی شما است.",
      noProjectsTitle: "اولین پروژه خود را اضافه کنید",
      noProjectsDescription:
        "CUT3 به یک پوشه پروژه نیاز دارد تا بتواند thread ها را ایجاد کند، دستورهای محلی را کشف کند، و AGENTS.md و skill های فضای کاری را بخواند.",
      browse: "مرور پوشه",
      addProject: "افزودن پروژه",
      pathLabel: "مسیر پروژه",
      pathPlaceholder: "/path/to/project",
      nextStepHint: "بعد از افزودن پروژه، CUT3 فوراً اولین thread پیش نویس را برای شما باز می کند.",
      existingProjectsTitle: "یک thread جدید شروع کنید",
      existingProjectsDescription: (count: number) =>
        `${count} پروژه از قبل در CUT3 موجود است. می توانید یک thread جدید بسازید یا از سایدبار یک thread قبلی را ادامه دهید.`,
      createThread: "ایجاد thread جدید",
      sidebarHint: "یا یک thread موجود را از سایدبار انتخاب کنید.",
    };
  }

  return {
    loadingTitle: "Preparing your projects...",
    loadingDescription: "CUT3 is syncing the local workspace state.",
    noProjectsTitle: "Add your first project",
    noProjectsDescription:
      "CUT3 needs a project folder before it can create threads, discover repo-local commands, and read workspace AGENTS.md and skills.",
    browse: "Browse for folder",
    addProject: "Add project",
    pathLabel: "Project path",
    pathPlaceholder: "/path/to/project",
    nextStepHint:
      "After you add a project, CUT3 immediately opens your first draft thread so you can start working right away.",
    existingProjectsTitle: "Start a new thread",
    existingProjectsDescription: (count: number) =>
      `${count} project${count === 1 ? " is" : "s are"} already available in CUT3. Start a new thread or resume one from the sidebar.`,
    createThread: "Create new thread",
    sidebarHint: "Or pick an existing thread from the sidebar.",
  };
}

export function EmptyChatOnboarding() {
  const {
    settings: { language },
  } = useAppSettings();
  const copy = useMemo(() => getEmptyChatOnboardingCopy(language), [language]);
  const threadsHydrated = useStore((store) => store.threadsHydrated);
  const projects = useStore((store) => store.projects);
  const projectCount = projects.length;
  const { defaultProjectId, openDefaultNewThread } = useNewThreadActions();
  const {
    addProjectError,
    addProjectFromPath,
    canAddProject,
    clearProjectCreationError,
    isAddingProject,
    isPickingFolder,
    newCwd,
    pickProjectFolder,
    setNewCwd,
  } = useProjectCreationActions();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleAddProject = () => {
    void addProjectFromPath(newCwd);
  };

  const handlePickFolder = async () => {
    const pickedPath = await pickProjectFolder();
    if (pickedPath) {
      await addProjectFromPath(pickedPath);
      return;
    }
    inputRef.current?.focus();
  };

  if (!threadsHydrated) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-3xl border border-border/60 bg-card/55 px-6 py-12 text-center shadow-[0_24px_80px_-48px_--alpha(var(--color-black)/25%)] backdrop-blur-sm">
        <div className="mb-1 flex items-center gap-[6px]">
          <span className="app-tool-live-dot h-2 w-2 rounded-full bg-primary/70" />
          <span className="app-tool-live-dot h-2 w-2 rounded-full bg-primary/50 [animation-delay:160ms]" />
          <span className="app-tool-live-dot h-2 w-2 rounded-full bg-primary/30 [animation-delay:320ms]" />
        </div>
        <p className="text-base font-medium text-foreground">{copy.loadingTitle}</p>
        <p className="max-w-xl text-sm text-muted-foreground/70">{copy.loadingDescription}</p>
      </div>
    );
  }

  if (projectCount === 0) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-border/60 bg-card/55 px-6 py-8 shadow-[0_24px_80px_-48px_--alpha(var(--color-black)/25%)] backdrop-blur-sm sm:px-8 sm:py-10">
        <div className="space-y-2 text-center sm:text-left">
          <p className="text-balance text-2xl font-semibold tracking-tight text-foreground">
            {copy.noProjectsTitle}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground/80">
            {copy.noProjectsDescription}
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border/50 bg-background/60 p-4 shadow-[inset_0_1px_0_--alpha(var(--color-white)/4%)]">
          {isElectron ? (
            <Button
              type="button"
              className="w-full justify-center"
              disabled={isPickingFolder || isAddingProject}
              onClick={() => {
                void handlePickFolder();
              }}
            >
              <FolderIcon className="size-4" />
              {isPickingFolder ? `${copy.browse}...` : copy.browse}
            </Button>
          ) : null}

          <label className="grid gap-2">
            <span className="text-xs font-medium text-foreground">{copy.pathLabel}</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={inputRef}
                value={newCwd}
                onChange={(event) => {
                  setNewCwd(event.target.value);
                  clearProjectCreationError();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddProject();
                  }
                }}
                placeholder={copy.pathPlaceholder}
                spellCheck={false}
                className="font-mono"
              />
              <Button type="button" disabled={!canAddProject} onClick={handleAddProject}>
                {isAddingProject ? `${copy.addProject}...` : copy.addProject}
              </Button>
            </div>
          </label>

          {addProjectError ? <p className="text-xs text-destructive">{addProjectError}</p> : null}
          <p className="text-xs leading-relaxed text-muted-foreground/65">{copy.nextStepHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-border/60 bg-card/55 px-6 py-8 text-center shadow-[0_24px_80px_-48px_--alpha(var(--color-black)/25%)] backdrop-blur-sm sm:px-8 sm:py-10">
      <div className="space-y-2">
        <p className="text-balance text-2xl font-semibold tracking-tight text-foreground">
          {copy.existingProjectsTitle}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground/80">
          {copy.existingProjectsDescription(projectCount)}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          size="lg"
          disabled={!defaultProjectId}
          onClick={() => {
            void openDefaultNewThread();
          }}
          className="shadow-[0_4px_14px_-4px_--alpha(var(--color-primary)/35%)]"
        >
          <MessageSquarePlusIcon className="size-4" />
          {copy.createThread}
        </Button>
        {addProjectError ? <p className="text-xs text-destructive">{addProjectError}</p> : null}
        <p className="text-xs text-muted-foreground">{copy.sidebarHint}</p>
      </div>
    </div>
  );
}
