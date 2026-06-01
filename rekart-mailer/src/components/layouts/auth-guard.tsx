"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { DashboardSkeleton } from "@/components/shared/skeleton-loader";
import { ROUTES } from "@/constants/routes";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapping } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isBootstrapping && !isAuthenticated) {
      router.replace(ROUTES.LOGIN);
    }
  }, [isBootstrapping, isAuthenticated, router]);

  // While bootstrapping (checking existing token), show skeleton
  if (isBootstrapping) {
    return <DashboardSkeleton />;
  }

  // Unauthenticated — redirect in progress
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
