"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsUpDown, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/store/ui.store";
import { useAuthStore } from "@/store/auth.store";
import { SidebarNavGroups } from "./sidebar-nav-groups";
import { ROUTES } from "@/constants/routes";

export function Sidebar() {
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { workspace } = useAuthStore();

  const activeWorkspace = workspace ?? { name: "Workspace", plan: "FREE", _id: "" };

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="relative hidden h-screen min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex"
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between px-3 py-2">
        <Logo collapsed={sidebarCollapsed} />
        <button
          onClick={toggleSidebar}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Toggle sidebar"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>

      {/* Workspace Switcher */}
      <div className="shrink-0 px-2 py-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent",
                  sidebarCollapsed && "justify-center px-1"
                )}
              />
            }
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
              {activeWorkspace.name.charAt(0).toUpperCase()}
            </div>
            {!sidebarCollapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-tight text-foreground">
                    {activeWorkspace.name}
                  </p>
                  <p className="text-[11px] capitalize text-muted-foreground">
                    {activeWorkspace.plan}
                  </p>
                </div>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Current workspace
            </DropdownMenuLabel>
            {workspace && (
              <DropdownMenuItem className="gap-2" onClick={() => router.push(ROUTES.SETTINGS_WORKSPACE)}>
                <div className="flex size-5 items-center justify-center rounded bg-primary/10 text-[10px] font-semibold text-primary">
                  {workspace.name.charAt(0)}
                </div>
                <span className="flex-1 text-sm truncate">{workspace.name}</span>
                <Check className="size-3.5 text-primary" />
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-muted-foreground" onClick={() => router.push(ROUTES.SETTINGS_WORKSPACE)}>
              <Plus className="size-4" />
              <span className="text-sm">Manage workspace</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <ScrollArea className="min-h-0 flex-1 px-2 py-2">
        <SidebarNavGroups sidebarCollapsed={sidebarCollapsed} />
      </ScrollArea>

      {/* Footer */}
      {!sidebarCollapsed && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="shrink-0 border-t border-sidebar-border px-3 py-3"
          >
            <p className="text-[10px] text-muted-foreground/60">
              © 2026 Rekart Mailer
            </p>
          </motion.div>
        </AnimatePresence>
      )}
    </motion.aside>
  );
}
