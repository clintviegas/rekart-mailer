import { WORKFLOW_CONFIGS } from "./workflow-config";
import type { WorkflowStep } from "./types";

export const REPAIR_WORKFLOW_STEPS: WorkflowStep[] = WORKFLOW_CONFIGS.map(
  (cfg, i) => ({
    id: cfg.stepId,
    title: cfg.title,
    description: cfg.description,
    icon: cfg.icon,
    status: i === 0 ? "configured" : i === 1 ? "partial" : "empty",
    order: i + 1,
  }),
);

export const STATUS_CONFIG = {
  configured: {
    label: "Configured",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  partial: {
    label: "Partial",
    dotClass: "bg-amber-400",
    textClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-50 dark:bg-amber-950/40",
  },
  empty: {
    label: "Not set",
    dotClass: "bg-border",
    textClass: "text-muted-foreground",
    bgClass: "",
  },
} as const;
