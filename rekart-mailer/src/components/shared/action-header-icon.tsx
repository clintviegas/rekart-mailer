"use client";

import React from "react";
import { cn } from "@/lib/utils";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("size-5 stroke-[2.5]", className)}
    >
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" />
      <path
        d="M16 4h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path d="M21 8.5 12 3 3 8.5V16.5L12 22l9-5.5V8.5Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M3 8.5 12 14l9-5.5M12 14v8" stroke="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path
        d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.5" stroke="currentColor" />
    </svg>
  );
}

function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path
        d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.2l5-.7L12 3Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path
        d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h6a8 8 0 0 1 8 8Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path d="M5 17h14M5 17a2 2 0 1 1-4 0v-3l2-6h14l2 6v3a2 2 0 1 1-4 0M5 17H3" stroke="currentColor" strokeLinecap="round" />
      <circle cx="7.5" cy="17" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="17" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path d="M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V3Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path
        d="M14.7 6.3a3.5 3.5 0 0 0-4.95 4.95L4 17v3h3l5.75-5.75a3.5 3.5 0 0 0 4.95-4.95l-1.5 1.5-3.45-3.45 1.5-1.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CoinsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <ellipse cx="9" cy="8" rx="5" ry="2.5" stroke="currentColor" />
      <path d="M4 8v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V8" stroke="currentColor" />
      <path d="M4 12v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4" stroke="currentColor" />
    </svg>
  );
}

function MicroscopeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path d="M6 18h12M9 18V9a3 3 0 1 1 6 0v9" stroke="currentColor" strokeLinecap="round" />
      <path d="M12 6V3M8 3h8" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" />
    </svg>
  );
}

function InfoCircleIcon({ className, filled = false }: { className?: string; filled?: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className={cn("size-4", className)}>
        <circle cx="12" cy="12" r="9" fill="currentColor" />
        <path stroke="#ffffff" strokeWidth="2" strokeLinecap="round" d="M12 10v6" />
        <circle cx="12" cy="7.5" r="1.1" fill="#ffffff" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" />
      <path d="M12 10v6M12 7h.01" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 stroke-[2]", className)}>
      <path d="M12 4 3 20h18L12 4Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

type ResolvedIcon = {
  style: (typeof ICON_STYLES)[keyof typeof ICON_STYLES];
  node: React.ReactNode;
};

function resolveActionIcon(key: string): ResolvedIcon | null {
  switch (key.trim()) {
    case "✅":
    case "✓":
      return { style: ICON_STYLES.check, node: <CheckIcon className={ICON_STYLES.check.fg} /> };
    case "📋":
      return { style: ICON_STYLES.neutral, node: <ClipboardIcon className={ICON_STYLES.neutral.fg} /> };
    case "📦":
      return { style: ICON_STYLES.sky, node: <PackageIcon className={ICON_STYLES.sky.fg} /> };
    case "📍":
      return { style: ICON_STYLES.violet, node: <PinIcon className={ICON_STYLES.violet.fg} /> };
    case "⭐":
      return { style: ICON_STYLES.amber, node: <StarIcon className={ICON_STYLES.amber.fg} /> };
    case "💬":
      return { style: ICON_STYLES.sky, node: <ChatIcon className={ICON_STYLES.sky.fg} /> };
    case "🚗":
      return { style: ICON_STYLES.neutral, node: <CarIcon className={ICON_STYLES.neutral.fg} /> };
    case "🧾":
      return { style: ICON_STYLES.neutral, node: <ReceiptIcon className={ICON_STYLES.neutral.fg} /> };
    case "🔧":
      return { style: ICON_STYLES.violet, node: <WrenchIcon className={ICON_STYLES.violet.fg} /> };
    case "💰":
      return { style: ICON_STYLES.amber, node: <CoinsIcon className={ICON_STYLES.amber.fg} /> };
    case "🔬":
      return { style: ICON_STYLES.sky, node: <MicroscopeIcon className={ICON_STYLES.sky.fg} /> };
    case "🎉":
      return { style: ICON_STYLES.check, node: <SparklesIcon className={ICON_STYLES.check.fg} /> };
    case "info":
    case "ℹ️":
      return { style: ICON_STYLES.sky, node: <InfoCircleIcon className={ICON_STYLES.sky.fg} /> };
    case "warning":
    case "⚠️":
      return { style: ICON_STYLES.amber, node: <AlertTriangleIcon className={ICON_STYLES.amber.fg} /> };
    default:
      return null;
  }
}

const ICON_STYLES: Record<string, { bg: string; ring: string; shadow: string; fg: string }> = {
  check: {
    bg: "bg-emerald-500",
    ring: "ring-emerald-400/35",
    shadow: "shadow-emerald-500/30",
    fg: "text-white",
  },
  neutral: {
    bg: "bg-slate-100",
    ring: "ring-white/15",
    shadow: "shadow-black/20",
    fg: "text-slate-700",
  },
  sky: {
    bg: "bg-sky-500",
    ring: "ring-sky-400/35",
    shadow: "shadow-sky-500/30",
    fg: "text-white",
  },
  amber: {
    bg: "bg-amber-400",
    ring: "ring-amber-300/35",
    shadow: "shadow-amber-400/30",
    fg: "text-amber-950",
  },
  violet: {
    bg: "bg-violet-500",
    ring: "ring-violet-400/35",
    shadow: "shadow-violet-500/30",
    fg: "text-white",
  },
};

/** Clean header icons for customer action pages — avoids chunky system emojis. */
export function ActionHeaderIcon({
  icon,
  size = "lg",
  className,
}: {
  icon: string;
  size?: "lg" | "sm";
  className?: string;
}) {
  const mapped = resolveActionIcon(icon);
  const shell = size === "sm" ? "size-6 shadow-sm ring-1" : "mx-auto size-11 shadow-lg ring-2";

  if (mapped) {
    const s = mapped.style;
    const inner =
      size === "sm"
        ? React.cloneElement(mapped.node as React.ReactElement<{ className?: string }>, {
            className: cn("size-3 stroke-[2.5]", s.fg),
          })
        : mapped.node;
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          shell,
          s.bg,
          s.ring,
          s.shadow,
          className,
        )}
        aria-hidden
      >
        {inner}
      </div>
    );
  }

  return (
    <div className={cn(size === "sm" ? "text-base" : "text-4xl", "leading-none", className)} aria-hidden>
      {icon}
    </div>
  );
}

/** Progress list icon for track pages. */
export function TrackStepIcon({
  variant,
  icon,
}: {
  variant: "done" | "current" | "pending";
  icon?: string;
}) {
  if (variant === "done") {
    return <ActionHeaderIcon icon="✅" size="sm" />;
  }
  if (variant === "current" && icon) {
    return <ActionHeaderIcon icon={icon} size="sm" />;
  }
  return (
    <div
      className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white"
      aria-hidden
    >
      <span className="size-1.5 rounded-full bg-slate-300" />
    </div>
  );
}

/** Inline success row — e.g. payment confirmed banner. */
export function InlineSuccessBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
      <ActionHeaderIcon icon="✅" size="sm" />
      <span>{children}</span>
    </div>
  );
}

/** Inline info note — e.g. payment timing on quote accept page. */
export function InlineInfoBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5 text-xs leading-relaxed text-sky-950">
      <InfoCircleIcon filled className="mt-0.5 shrink-0 text-sky-500" />
      <span>{children}</span>
    </div>
  );
}

/** Inline warning note — e.g. already-processed messages on action pages. */
export function InlineWarningBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 stroke-[2.5] text-amber-500" />
      <span>{children}</span>
    </div>
  );
}
