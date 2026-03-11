import { type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { SquarePenIcon } from "lucide-react";
import { useMemo } from "react";

import { useNewThreadActions } from "../hooks/useNewThread";
import { shortcutLabelForCommand } from "../keybindings";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];

export default function ThreadNewButton({ className }: { className?: string }) {
  const { data: keybindings = EMPTY_KEYBINDINGS } = useQuery({
    ...serverConfigQueryOptions(),
    select: (config) => config.keybindings,
  });
  const { defaultProjectId, openDefaultNewThread } = useNewThreadActions();
  const shortcutLabel = useMemo(
    () =>
      shortcutLabelForCommand(keybindings, "chat.newLocal") ??
      shortcutLabelForCommand(keybindings, "chat.new"),
    [keybindings],
  );
  const buttonLabel = defaultProjectId
    ? shortcutLabel
      ? `New thread (${shortcutLabel})`
      : "New thread"
    : "No project available for a new thread";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex shrink-0">
            <Button
              aria-label={buttonLabel}
              className={cn(
                "size-8 shrink-0 rounded-md border border-border/70 bg-background/80 shadow-sm backdrop-blur-sm hover:bg-accent/80",
                className,
              )}
              data-testid="global-new-thread-button"
              disabled={!defaultProjectId}
              onClick={() => {
                void openDefaultNewThread();
              }}
              size="icon"
              variant="outline"
            >
              <SquarePenIcon className="size-3.5" />
              <span className="sr-only">{buttonLabel}</span>
            </Button>
          </span>
        }
      />
      <TooltipPopup side="bottom">{buttonLabel}</TooltipPopup>
    </Tooltip>
  );
}
