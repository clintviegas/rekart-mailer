import type { LucideIcon } from "lucide-react";

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
  options?: string[];
  hint?: string;
  currencySymbol?: string;
  fullWidth?: boolean;
}

export interface WorkflowConfig {
  key: string;
  stepId: string;
  title: string;
  description: string;
  icon: LucideIcon;
  defaultSubject: string;
  fields: FieldConfig[];
}

export type StepStatus = "configured" | "partial" | "empty";

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  status: StepStatus;
  order: number;
}
