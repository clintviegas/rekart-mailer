import { z } from "zod";
import type { FieldConfig, WorkflowConfig } from "./types";

// ── Per-field schema builder ──────────────────────────────────────────────────
function buildFieldSchema(field: FieldConfig): z.ZodTypeAny {
  switch (field.type) {
    case "email": {
      if (field.required) {
        return z
          .string()
          .min(1, `${field.label} is required`)
          .email("Enter a valid email address");
      }
      return z
        .union([z.string().email("Enter a valid email address"), z.literal("")])
        .optional();
    }

    case "url": {
      if (field.required) {
        return z.string().min(1, `${field.label} is required`).url("Enter a valid URL");
      }
      return z
        .union([z.string().url("Enter a valid URL"), z.literal("")])
        .optional();
    }

    case "currency":
    case "number": {
      if (field.required) {
        return z.coerce
          .number()
          .min(0.01, `${field.label} must be greater than 0`);
      }
      return z.coerce.number().min(0).optional().or(z.literal("" as unknown as number));
    }

    case "checkbox": {
      return z.boolean().optional().default(false);
    }

    case "readonly": {
      // Auto-populated by backend — always optional in Zod, never user-validated
      return z.string().optional();
    }

    case "date":
    case "textarea":
    case "select":
    case "text":
    default: {
      if (field.required) {
        return z.string().min(1, `${field.label} is required`);
      }
      return z.string().optional();
    }
  }
}

// ── Full workflow schema (core + dynamic fields) ──────────────────────────────
export function buildWorkflowSchema(config: WorkflowConfig) {
  const dynamicShape: Record<string, z.ZodTypeAny> = {};
  for (const field of config.fields) {
    dynamicShape[field.name] = buildFieldSchema(field);
  }

  return z.object({
    // ── Core email fields ──────────────────────────────────────────────────
    subject: z.string().min(1, "Subject is required"),
    previewText: z.string().optional(),
    recipientEmail: z
      .string()
      .min(1, "Recipient email is required")
      .email("Enter a valid email address"),
    fromName: z.string().optional(),
    replyTo: z
      .union([z.string().email("Enter a valid reply-to email"), z.literal("")])
      .optional(),
    cc: z
      .union([z.string().email("Enter a valid CC email"), z.literal("")])
      .optional(),
    // ── Workflow-specific dynamic fields ───────────────────────────────────
    ...dynamicShape,
  });
}

export type DynamicSchema = ReturnType<typeof buildWorkflowSchema>;
export type DynamicFormValues = z.infer<DynamicSchema>;

// ── Default values initialiser ────────────────────────────────────────────────
/**
 * Builds a complete default-values object for the given workflow config.
 * If `persisted` is supplied, matching field names carry their values forward
 * (the cross-step value persistence mechanism).
 */
export function buildDefaultValues(
  config: WorkflowConfig,
  persisted?: Record<string, unknown>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {
    subject: config.defaultSubject,
    previewText: "",
    recipientEmail: "",
    fromName: "",
    replyTo: "",
    cc: "",
  };

  for (const field of config.fields) {
    if (field.type === "checkbox") {
      defaults[field.name] = false;
    } else if (field.type === "currency" || field.type === "number") {
      defaults[field.name] = "";
    } else {
      defaults[field.name] = "";
    }
  }

  // Overlay persisted values for any field name that exists in this workflow
  if (persisted) {
    for (const key of Object.keys(persisted)) {
      if (key in defaults && persisted[key] !== undefined && persisted[key] !== null) {
        defaults[key] = persisted[key];
      }
    }
  }

  return defaults;
}
