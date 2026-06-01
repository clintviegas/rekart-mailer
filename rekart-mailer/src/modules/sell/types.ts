import type { LucideIcon } from "lucide-react";

// ── Field types ──────────────────────────────────────────────────────────────
export type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "select"
  | "currency"
  | "number"
  | "url"
  | "date"
  | "checkbox"
  | "readonly";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  /** Select options (for type === "select") */
  options?: string[];
  /** Helper text shown below the field */
  hint?: string;
  /** Currency symbol or prefix (for type === "currency") */
  currencySymbol?: string;
  /** Span 2 columns in the grid layout */
  fullWidth?: boolean;
}

// ── Workflow config ──────────────────────────────────────────────────────────
export interface WorkflowConfig {
  key: string;
  stepId: string;
  title: string;
  description: string;
  icon: LucideIcon;
  defaultSubject: string;
  fields: FieldConfig[];
}

// ── Step (navigation) ────────────────────────────────────────────────────────
export type StepStatus = "configured" | "partial" | "empty";

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: StepStatus;
  order: number;
}

// ── Form values shape ────────────────────────────────────────────────────────
export interface CoreFormValues {
  subject: string;
  previewText: string;
  recipientEmail: string;
  fromName: string;
  replyTo: string;
  cc: string;
}

export type WorkflowFormValues = CoreFormValues & Record<string, unknown>;
