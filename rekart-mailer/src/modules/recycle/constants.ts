import { WORKFLOW_CONFIGS } from "./workflow-config";
import type { WorkflowStep } from "./types";

export const RECYCLE_WORKFLOW_STEPS: WorkflowStep[] = WORKFLOW_CONFIGS.map(
  (cfg, i) => ({
    id: cfg.stepId,
    title: cfg.title,
    description: cfg.description,
    icon: cfg.icon,
    status: i === 0 ? "configured" : "empty",
    order: i + 1,
  }),
);

export const RECYCLE_STATUS_CONFIG = {
  active: {
    label: "Active",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800",
  },
  completed: {
    label: "Certificate Issued",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800",
  },
  cancelled: {
    label: "Cancelled",
    cls: "text-slate-500 bg-slate-100 border-slate-200 dark:text-slate-400 dark:bg-slate-800/40 dark:border-slate-700",
  },
  request_declined: {
    label: "Declined",
    cls: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800",
  },
  no_customer_action: {
    label: "No response",
    cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800",
  },
} as const;

export const RECYCLE_COLLECTION_MODE_OPTIONS = [
  { value: "listed", label: "Known items (add rows)" },
  { value: "bulk_estimate", label: "Bulk / office clearance (estimate)" },
] as const;
