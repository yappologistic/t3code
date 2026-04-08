/**
 * CommandPalette - Global searchable command overlay.
 *
 * Opens with Ctrl+K / Cmd+K and provides quick access to
 * all major app actions with their keyboard shortcuts displayed.
 */
import { type KeybindingCommand, type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import {
  FilePlusIcon,
  FolderPlusIcon,
  LayoutDashboardIcon,
  Minimize2Icon,
  PanelLeftIcon,
  SearchIcon,
  SettingsIcon,
  SquareTerminalIcon,
  CodeIcon,
  BellIcon,
} from "lucide-react";
import { memo, useCallback, type ReactNode } from "react";
import { formatShortcutLabel } from "../keybindings";
import { useAppSettings } from "../appSettings";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "./ui/command";
import type { AppLanguage } from "../appLanguage";

export interface CommandPaletteAction {
  id: string;
  label: string;
  description?: string;
  keybindingCommand?: KeybindingCommand;
  icon?: ReactNode;
  action: () => void;
  disabled?: boolean;
  /** Extra keywords for fuzzy matching (not displayed). */
  keywords?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandPaletteAction[];
  keybindings: ResolvedKeybindingsConfig;
}

function getShortcutLabelForCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand | undefined,
): string | null {
  if (!command) return null;
  for (let i = keybindings.length - 1; i >= 0; i--) {
    const binding = keybindings[i];
    if (binding?.command === command) {
      return formatShortcutLabel(binding.shortcut);
    }
  }
  return null;
}

function getCopy(language: AppLanguage) {
  if (language === "fa") {
    return {
      placeholder: "جستجوی دستور…",
      noResults: "دستوری یافت نشد.",
      groupLabel: "دستورات",
      runCommand: "اجرا",
      navigate: "پیمایش",
      select: "انتخاب",
      close: "بستن",
    };
  }
  return {
    placeholder: "Type a command…",
    noResults: "No commands found.",
    groupLabel: "Commands",
    runCommand: "Run command",
    navigate: "Navigate",
    select: "Select",
    close: "Close",
  };
}

export const CommandPalette = memo(function CommandPalette(props: CommandPaletteProps) {
  const { open, onOpenChange, actions, keybindings } = props;
  const { settings } = useAppSettings();
  const copy = getCopy(settings.language);

  const handleSelect = useCallback(
    (action: CommandPaletteAction) => {
      onOpenChange(false);
      // Allow the dialog close animation to begin before running the action.
      requestAnimationFrame(() => action.action());
    },
    [onOpenChange],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <Command>
          <CommandInput className="py-3 text-[15px]" placeholder={copy.placeholder} />
          <CommandPanel>
            <CommandList className="not-empty:scroll-py-2 not-empty:p-2.5">
              <CommandEmpty className="not-empty:py-8 text-sm">{copy.noResults}</CommandEmpty>
              <CommandGroup>
                <CommandGroupLabel className="px-2 pb-1.5 pt-2 text-[11px] uppercase tracking-wide">
                  {copy.groupLabel}
                </CommandGroupLabel>
                {actions.map((action) => (
                  <CommandItem
                    key={action.id}
                    className="gap-3 rounded-lg px-3 py-2.5"
                    disabled={action.disabled}
                    value={`${action.id} ${action.label} ${action.description ?? ""} ${action.keywords ?? ""}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      if (action.disabled) return;
                      handleSelect(action);
                    }}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40">
                      {action.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-foreground">
                        {action.label}
                      </span>
                      {action.description ? (
                        <span className="block truncate pt-0.5 text-[11.5px] text-muted-foreground/80">
                          {action.description}
                        </span>
                      ) : null}
                    </span>
                    {action.keybindingCommand && (
                      <CommandShortcut>
                        {getShortcutLabelForCommand(keybindings, action.keybindingCommand)}
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </CommandPanel>
          <CommandFooter className="px-5 py-3.5">
            <span>{copy.runCommand}</span>
            <span className="flex items-center gap-2">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↑↓</kbd>
              <span>{copy.navigate}</span>
              <kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                ↵
              </kbd>
              <span>{copy.select}</span>
              <kbd className="ml-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                Esc
              </kbd>
              <span>{copy.close}</span>
            </span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  );
});

// ── Icon helpers used by consumers when building action lists ──────────

export const PALETTE_ICONS = {
  newChat: <FilePlusIcon className="size-4.5 text-muted-foreground/80" />,
  newLocalChat: <FolderPlusIcon className="size-4.5 text-muted-foreground/80" />,
  toggleSidebar: <PanelLeftIcon className="size-4.5 text-muted-foreground/80" />,
  toggleTerminal: <SquareTerminalIcon className="size-4.5 text-muted-foreground/80" />,
  toggleDiff: <LayoutDashboardIcon className="size-4.5 text-muted-foreground/80" />,
  settings: <SettingsIcon className="size-4.5 text-muted-foreground/80" />,
  openInEditor: <CodeIcon className="size-4.5 text-muted-foreground/80" />,
  notifications: <BellIcon className="size-4.5 text-muted-foreground/80" />,
  search: <SearchIcon className="size-4.5 text-muted-foreground/80" />,
  compact: <Minimize2Icon className="size-4.5 text-muted-foreground/80" />,
} as const;
