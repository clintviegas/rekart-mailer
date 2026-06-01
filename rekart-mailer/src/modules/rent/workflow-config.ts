import {
  Inbox,
  FileSignature,
  PackageCheck,
  Truck,
  Handshake,
  Bell,
  PackageOpen,
  CheckCircle2,
} from "lucide-react";
import type { WorkflowConfig } from "./types";

export const WORKFLOW_CONFIGS: WorkflowConfig[] = [
  {
    key: "rent_request",
    stepId: "rent-request",
    title: "Rent Request",
    description: "Sent when a customer submits a rent request",
    icon: Inbox,
    defaultSubject: "We received your rent request — #{{requestId}}",
    fields: [
      {
        name: "customerName",
        label: "Customer Name",
        type: "text",
        required: true,
        placeholder: "e.g. Rahul Sharma",
      },
      {
        name: "requestId",
        label: "Request ID",
        type: "readonly",
        hint: "Auto-generated · RKRT prefix",
        fullWidth: true,
      },
      {
        name: "customerPhone",
        label: "Phone",
        type: "text",
        placeholder: "e.g. +971 50 123 4567",
      },
      {
        name: "customerAddress",
        label: "Address",
        type: "textarea",
        placeholder: "Full address including landmark…",
        fullWidth: true,
      },
      {
        name: "fulfillmentMode",
        label: "Pickup or Delivery",
        type: "readonly",
        hint: "Customer chooses via email buttons (Pickup / Home delivery)",
      },
      {
        name: "rentalItemsSummary",
        label: "Rental items summary",
        type: "textarea",
        placeholder: "e.g. MacBook Pro ×1, Projector ×2",
        fullWidth: true,
      },
      {
        name: "rentalDuration",
        label: "Rental duration",
        type: "text",
        placeholder: "e.g. 7 days",
      },
      {
        name: "requestDate",
        label: "Request Date",
        type: "date",
        required: true,
      },
      {
        name: "trackUrl",
        label: "Tracking URL",
        type: "url",
        placeholder: "https://track.rekart.io/rent/...",
        fullWidth: true,
      },
    ],
  },
  {
    key: "rent_agreement",
    stepId: "rent-agreement",
    title: "Quote & Agreement",
    description: "Send quote with pricing after customer confirms items",
    icon: FileSignature,
    defaultSubject: "Your rental quote is ready — #{{requestId}}",
    fields: [
      { name: "requestId", label: "Request ID", type: "readonly", fullWidth: true },
      { name: "agreementUrl", label: "Agreement sign URL", type: "url", fullWidth: true },
    ],
  },
  {
    key: "rent_ready_pickup",
    stepId: "rent-ready-pickup",
    title: "Ready for Pickup",
    description: "Pickup branch — item ready at branch",
    icon: PackageCheck,
    defaultSubject: "Your rental is ready for pickup — #{{requestId}}",
    fields: [
      { name: "pickupAddress", label: "Pickup address", type: "textarea", fullWidth: true },
      { name: "pickupDate", label: "Pickup date", type: "date" },
    ],
  },
  {
    key: "rent_dispatched",
    stepId: "rent-dispatched",
    title: "Dispatched",
    description: "Delivery branch — courier dispatched",
    icon: Truck,
    defaultSubject: "Your rental is on the way — #{{requestId}}",
    fields: [
      { name: "courierName", label: "Courier", type: "text" },
      { name: "trackingNumber", label: "Tracking number", type: "text" },
    ],
  },
  {
    key: "rent_handover",
    stepId: "rent-handover",
    title: "Handover",
    description: "Payment + deposit collected at handover",
    icon: Handshake,
    defaultSubject: "Enjoy your rental — #{{requestId}}",
    fields: [
      { name: "rentalAmount", label: "Rental amount", type: "currency", currencySymbol: "₹" },
      { name: "securityDeposit", label: "Security deposit", type: "currency", currencySymbol: "₹" },
      { name: "returnDueDate", label: "Return due date", type: "date" },
      {
        name: "paymentMethod",
        label: "Payment method",
        type: "select",
        options: ["Cash", "Card", "Online (UPI / Card)", "Bank Transfer", "Other"],
      },
    ],
  },
  {
    key: "rent_return_reminder",
    stepId: "rent-return-reminder",
    title: "Return Reminder",
    description: "Auto-sends 24h before return due — skipped if you send manually",
    icon: Bell,
    defaultSubject: "Reminder: return due soon — #{{requestId}}",
    fields: [
      { name: "returnDueDate", label: "Return due date", type: "date" },
    ],
  },
  {
    key: "rent_return_received",
    stepId: "rent-return-received",
    title: "Return Received",
    description: "Condition check after return",
    icon: PackageOpen,
    defaultSubject: "We received your return — #{{requestId}}",
    fields: [
      { name: "returnCondition", label: "Return condition", type: "textarea", fullWidth: true },
    ],
  },
  {
    key: "rent_closed",
    stepId: "rent-closed",
    title: "Closed",
    description: "Deposit settlement + thank you",
    icon: CheckCircle2,
    defaultSubject: "Your rent journey is complete — #{{requestId}}",
    fields: [
      { name: "depositRefund", label: "Deposit refund", type: "currency", currencySymbol: "₹" },
      { name: "depositDeduction", label: "Deposit deduction", type: "currency", currencySymbol: "₹" },
    ],
  },
];

export function getWorkflowConfig(stepId: string): WorkflowConfig {
  return WORKFLOW_CONFIGS.find((c) => c.stepId === stepId) ?? WORKFLOW_CONFIGS[0];
}
