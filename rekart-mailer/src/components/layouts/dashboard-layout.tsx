"use client";

import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { MobileNav } from "./mobile-nav";
import { AuthGuard } from "./auth-guard";
import { DashboardScrollRestoration } from "./dashboard-scroll-restoration";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <TooltipProvider delay={0}>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <MobileNav />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Navbar />
            <main className="flex-1 overflow-hidden min-h-0">
              <Suspense fallback={null}>
                <DashboardScrollRestoration />
              </Suspense>
              {children}
            </main>
          </div>
        </div>
      </TooltipProvider>
    </AuthGuard>
  );
}
