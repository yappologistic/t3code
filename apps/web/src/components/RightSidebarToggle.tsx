import { useMemo } from "react";

import { useAppSettings } from "../appSettings";
import { PanelRightIcon, PanelRightCloseIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useRightSidebar } from "./right-sidebar/RightSidebarContext";
import { cn } from "../lib/utils";

export default function RightSidebarToggle({ className }: { className?: string }) {
  const { rightSidebarExpanded, toggleRightSidebar } = useRightSidebar();
  const {
    settings: { language },
  } = useAppSettings();
  const toggleLabel = useMemo(() => {
    if (language === "fa") {
      return "تغییر نوار کناری راست";
    }
    return rightSidebarExpanded ? "Close right sidebar" : "Open right sidebar";
  }, [language, rightSidebarExpanded]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-8 shrink-0 rounded-md border border-border/70 bg-background/80 shadow-sm backdrop-blur-sm hover:bg-accent/80",
        className,
      )}
      onClick={toggleRightSidebar}
      title={toggleLabel}
    >
      {rightSidebarExpanded ? (
        <PanelRightCloseIcon className="size-4" />
      ) : (
        <PanelRightIcon className="size-4" />
      )}
    </Button>
  );
}
