import { memo, useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon, PencilIcon } from "lucide-react";
import { readNativeApi } from "../../nativeApi";
import { newCommandId } from "../../lib/utils";
import { ThreadId } from "@t3tools/contracts";

interface ThreadGoalStatementProps {
  threadId: ThreadId;
  goal: string | null;
  className?: string;
}

const GOAL_PLACEHOLDER = "What is this thread trying to accomplish?";

export const ThreadGoalStatement = memo(function ThreadGoalStatement({
  threadId,
  goal,
  className,
}: ThreadGoalStatementProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(goal ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setEditValue(goal ?? "");
  }, [goal]);

  const saveGoal = useCallback(
    async (value: string) => {
      if (!threadId || isSaving) return;
      setIsSaving(true);

      try {
        const api = readNativeApi();
        if (!api) return;

        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId,
          goal: value.trim() || null,
        });

        setShowSaved(true);
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          setShowSaved(false);
        }, 1500);
      } catch (error) {
        console.error("Failed to save thread goal:", error);
      } finally {
        setIsSaving(false);
      }
    },
    [threadId, isSaving],
  );

  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (editValue !== (goal ?? "")) {
      void saveGoal(editValue);
    }
  }, [editValue, goal, saveGoal]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inputRef.current?.blur();
      }
      if (e.key === "Escape") {
        setEditValue(goal ?? "");
        setIsEditing(false);
      }
    },
    [goal],
  );

  const handleClick = useCallback(() => {
    setIsEditing(true);
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 rounded-md border border-ring/50 bg-background px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={GOAL_PLACEHOLDER}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            maxLength={500}
          />
          {isSaving ? (
            <span className="text-xs text-muted-foreground">Saving...</span>
          ) : (
            <CheckIcon className="size-4 text-muted-foreground" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/50"
      >
        <PencilIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
        <span
          className={`flex-1 text-sm ${
            goal ? "text-foreground" : "text-muted-foreground italic"
          }`}
        >
          {goal || GOAL_PLACEHOLDER}
        </span>
        {showSaved && (
          <span className="text-xs text-muted-foreground">Saved</span>
        )}
      </button>
    </div>
  );
});
