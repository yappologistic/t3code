import type { ProjectId } from "@t3tools/contracts";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";

import type { ApprovalRule } from "../../approvalRules";
import {
  APPROVAL_RULE_ACTION_OPTIONS,
  APPROVAL_RULE_PRESETS,
  APPROVAL_RULE_REQUEST_KIND_OPTIONS,
  APPROVAL_RULE_SCOPE_OPTIONS,
  cloneApprovalPresetRules,
  createBlankApprovalRule,
} from "../../approvalRules";
import type { Project } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";

interface PermissionPoliciesSectionProps {
  rules: ReadonlyArray<ApprovalRule>;
  defaultRules: ReadonlyArray<ApprovalRule>;
  projects: ReadonlyArray<Project>;
  activeProjectId: ProjectId | null;
  onChangeRules: (rules: ApprovalRule[]) => void;
}

function updateRuleAt(
  rules: ReadonlyArray<ApprovalRule>,
  ruleId: string,
  updater: (rule: ApprovalRule) => ApprovalRule,
): ApprovalRule[] {
  return rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule));
}

function moveRule(
  rules: ReadonlyArray<ApprovalRule>,
  ruleId: string,
  direction: -1 | 1,
): ApprovalRule[] {
  const index = rules.findIndex((rule) => rule.id === ruleId);
  if (index < 0) {
    return [...rules];
  }
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= rules.length) {
    return [...rules];
  }
  const next = [...rules];
  const [moved] = next.splice(index, 1);
  if (!moved) {
    return [...rules];
  }
  next.splice(targetIndex, 0, moved);
  return next;
}

function toggleRequestKind(rule: ApprovalRule, requestKind: ApprovalRule["requestKinds"][number]) {
  if (rule.requestKinds.includes(requestKind)) {
    if (rule.requestKinds.length === 1) {
      return rule;
    }
    return {
      ...rule,
      requestKinds: rule.requestKinds.filter((entry) => entry !== requestKind),
    };
  }

  return {
    ...rule,
    requestKinds: [...rule.requestKinds, requestKind],
  };
}

export function PermissionPoliciesSection({
  rules,
  defaultRules,
  projects,
  activeProjectId,
  onChangeRules,
}: PermissionPoliciesSectionProps) {
  const hasDefaults = JSON.stringify(rules) !== JSON.stringify(defaultRules);
  const activeProject = activeProjectId
    ? (projects.find((project) => project.id === activeProjectId) ?? null)
    : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Permission policies</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Rules are checked from top to bottom. Empty match terms create catch-all rules. Use
            app-wide rules for your default posture, then add narrower project rules above them when
            you trust a specific repo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            variant="outline"
            onClick={() => onChangeRules([...rules, createBlankApprovalRule(null)])}
          >
            <PlusIcon className="size-3.5" />
            Add app rule
          </Button>
          {activeProject ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => onChangeRules([...rules, createBlankApprovalRule(activeProject.id)])}
            >
              <PlusIcon className="size-3.5" />
              Add {activeProject.name} rule
            </Button>
          ) : null}
          {APPROVAL_RULE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              size="xs"
              variant="outline"
              onClick={() =>
                onChangeRules([...rules, ...cloneApprovalPresetRules(preset.id, null)])
              }
            >
              {preset.label} preset
            </Button>
          ))}
          {hasDefaults ? (
            <Button size="xs" variant="outline" onClick={() => onChangeRules([...defaultRules])}>
              Reset rules
            </Button>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
        Current runtime approvals expose command, file-read, file-change, raw request type, and
        truncated detail text. If a provider starts emitting a new request type later, you can
        target it with Request type terms even before Rowl adds a dedicated label for it.
      </div>

      <div className="mt-4 grid gap-3">
        {rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
            No permission rules are saved yet. Add a rule or start from one of the presets.
          </div>
        ) : null}

        {rules.map((rule, index) => {
          const isFirst = index === 0;
          const isLast = index === rules.length - 1;
          return (
            <div key={rule.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[14rem] flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Label</label>
                  <Input
                    value={rule.label}
                    placeholder="Allow local test commands"
                    onChange={(event) =>
                      onChangeRules(
                        updateRuleAt(rules, rule.id, (current) => ({
                          ...current,
                          label: event.target.value,
                        })),
                      )
                    }
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) =>
                      onChangeRules(
                        updateRuleAt(rules, rule.id, (current) => ({
                          ...current,
                          enabled: Boolean(checked),
                        })),
                      )
                    }
                    aria-label={`Enable ${rule.label}`}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={isFirst}
                    aria-label="Move rule up"
                    onClick={() => onChangeRules(moveRule(rules, rule.id, -1))}
                  >
                    <ArrowUpIcon className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={isLast}
                    aria-label="Move rule down"
                    onClick={() => onChangeRules(moveRule(rules, rule.id, 1))}
                  >
                    <ArrowDownIcon className="size-4" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete rule"
                    onClick={() => onChangeRules(rules.filter((entry) => entry.id !== rule.id))}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Scope</label>
                  <Select
                    value={rule.scope}
                    onValueChange={(value) =>
                      onChangeRules(
                        updateRuleAt(rules, rule.id, (current) => ({
                          ...current,
                          scope: value === "project" ? "project" : "app",
                          projectId:
                            value === "project" ? (current.projectId ?? activeProjectId) : null,
                        })),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectPopup>
                      {APPROVAL_RULE_SCOPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Action</label>
                  <Select
                    value={rule.action}
                    onValueChange={(value) =>
                      onChangeRules(
                        updateRuleAt(rules, rule.id, (current) => ({
                          ...current,
                          action:
                            value === "allow" || value === "deny" || value === "ask"
                              ? value
                              : current.action,
                        })),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectPopup>
                      {APPROVAL_RULE_ACTION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Project</label>
                  <Select
                    value={rule.projectId ?? undefined}
                    disabled={rule.scope !== "project"}
                    onValueChange={(value) =>
                      onChangeRules(
                        updateRuleAt(rules, rule.id, (current) => ({
                          ...current,
                          projectId: value as ProjectId,
                        })),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectPopup>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <label className="text-xs font-medium text-foreground">Approval kinds</label>
                <div className="flex flex-wrap gap-2">
                  {APPROVAL_RULE_REQUEST_KIND_OPTIONS.map((option) => {
                    const selected = rule.requestKinds.includes(option.value);
                    return (
                      <Button
                        key={option.value}
                        size="xs"
                        variant={selected ? "default" : "outline"}
                        aria-pressed={selected}
                        onClick={() =>
                          onChangeRules(
                            updateRuleAt(rules, rule.id, (current) =>
                              toggleRequestKind(current, option.value),
                            ),
                          )
                        }
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Request type terms</label>
                  <Input
                    value={rule.requestTypeTerms}
                    placeholder="apply_patch_approval"
                    onChange={(event) =>
                      onChangeRules(
                        updateRuleAt(rules, rule.id, (current) => ({
                          ...current,
                          requestTypeTerms: event.target.value,
                        })),
                      )
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional. Match against the provider request type. Separate multiple terms with
                    commas or new lines.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Match terms</label>
                  <textarea
                    className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    value={rule.matchText}
                    placeholder={"npm test\nvitest\nbun run typecheck"}
                    onChange={(event) =>
                      onChangeRules(
                        updateRuleAt(rules, rule.id, (current) => ({
                          ...current,
                          matchText: event.target.value,
                        })),
                      )
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional. Match against the truncated approval detail text. Leave blank to make
                    this rule a catch-all for the selected kinds.
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
        {APPROVAL_RULE_PRESETS.map((preset) => (
          <div key={preset.id} className="rounded-lg border border-border bg-background px-3 py-2">
            <span className="font-medium text-foreground">{preset.label}:</span>{" "}
            {preset.description}
          </div>
        ))}
      </div>
    </section>
  );
}
