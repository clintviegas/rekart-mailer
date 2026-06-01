import { WORKFLOW_CONFIGS } from "./workflow-config";
import type { WorkflowStep } from "./types";

export const RENT_WORKFLOW_STEPS: WorkflowStep[] = WORKFLOW_CONFIGS.map(
  (cfg, i) => ({
    id: cfg.stepId,
    title: cfg.title,
    description: cfg.description,
    icon: cfg.icon,
    status: i === 0 ? "configured" : "empty",
    order: i + 1,
  }),
);

export const RENT_FULFILLMENT_OPTIONS = [
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Delivery" },
] as const;

export const RENT_STATUS_CONFIG = {
  active: {
    label: "Active",
    cls: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800",
  },
  completed: {
    label: "Completed",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800",
  },
  cancelled: {
    label: "Cancelled",
    cls: "text-slate-500 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800/40 dark:border-slate-700",
  },
} as const;
