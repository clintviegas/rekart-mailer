"use client";

import { useAuthStore } from "@/store/auth.store";
import { Skeleton } from "@/components/shared/skeleton-loader";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardGreeting() {
  const { user, workspace, isBootstrapping } = useAuthStore();

  if (isBootstrapping) {
    return (
      <div>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-1.5 h-4 w-40" />
      </div>
    );
  }

  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {getGreeting()}, {firstName}
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {workspace
          ? `${workspace.name} · ${workspace.plan} plan`
          : "Here's your email performance overview."}
      </p>
    </div>
  );
}
