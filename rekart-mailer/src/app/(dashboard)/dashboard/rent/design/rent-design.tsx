"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/constants/routes";
import { WORKFLOW_CONFIGS } from "@/modules/rent/workflow-config";
import { RENT_WORKFLOW_STEPS } from "@/modules/rent/constants";
import { BusinessLocationsSettings } from "@/components/shared/business-locations-settings";

export function RentDesignClient() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href={ROUTES.RENT}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-[15px] font-bold text-foreground">
              RENT Email Design
            </h1>
            <p className="text-[11px] text-muted-foreground">
              8-step rental workflow — template editor coming in v1.1
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <p className="text-[12px] text-amber-900 dark:text-amber-200">
              v1 ships with default templates per step. Full visual editor (like
              Sell/Repair design) will land with agreement e-sign and admin
              review steps.
            </p>
          </div>

          {WORKFLOW_CONFIGS.map((cfg) => {
            const nav = RENT_WORKFLOW_STEPS.find((s) => s.id === cfg.stepId);
            const Icon = cfg.icon;
            const configured = nav?.status === "configured";

            return (
              <div
                key={cfg.stepId}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      configured
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14px] font-semibold text-foreground">
                        {cfg.title}
                      </h2>
                      {configured ? (
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                      ) : (
                        <Circle className="size-3.5 text-muted-foreground/40" />
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {cfg.description}
                    </p>
                    <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
                      {cfg.defaultSubject}
                    </p>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      {cfg.fields.length} merge field
                      {cfg.fields.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mx-auto mt-6 max-w-2xl">
          <BusinessLocationsSettings />
        </div>
      </div>
    </div>
  );
}
