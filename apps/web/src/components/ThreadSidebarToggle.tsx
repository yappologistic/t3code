import { type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { shortcutLabelForCommand } from "../keybindings";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { cn } from "../lib/utils";
import { SidebarTrigger } from "./ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];

export default function ThreadSidebarToggle({ className }: { className?: string }) {
  const { data: keybindings = EMPTY_KEYBINDINGS } = useQuery({
    ...serverConfigQueryOptions(),
    select: (config) => config.keybindings,
  });
  const toggleLabel = useMemo(() => {
    const shortcutLabel = shortcutLabelForCommand(keybindings, "sidebar.toggle");
    return shortcutLabel ? `Toggle sidebar (${shortcutLabel})` : "Toggle sidebar";
  }, [keybindings]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarTrigger
            className={cn(
              "size-8 shrink-0 rounded-md border border-border/70 bg-background/80 shadow-sm backdrop-blur-sm hover:bg-accent/80",
              className,
            )}
            showNativeTitle={false}
          />
        }
      />
      <TooltipPopup side="bottom">{toggleLabel}</TooltipPopup>
    </Tooltip>
  );
}
