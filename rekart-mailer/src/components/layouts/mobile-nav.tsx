"use client";

import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/shared/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore } from "@/store/ui.store";
import { SidebarNavGroups } from "./sidebar-nav-groups";

export function MobileNav() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();

  return (
    <AnimatePresence>
      {mobileSidebarOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="fixed inset-y-0 left-0 z-50 flex w-64 min-h-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar lg:hidden"
          >
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <Logo />
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Navigation */}
            <ScrollArea className="min-h-0 flex-1 px-3 py-2">
              <SidebarNavGroups onNavigate={() => setMobileSidebarOpen(false)} />
            </ScrollArea>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
