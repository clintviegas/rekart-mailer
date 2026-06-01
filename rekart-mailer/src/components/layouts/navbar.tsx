"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Moon,
  Sun,
  Search,
  LogOut,
  Settings,
  User,
  Loader2,
  Building2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BreadcrumbNav } from "@/components/shared/breadcrumb-nav";
import { useUIStore } from "@/store/ui.store";
import { useAuth } from "@/hooks/use-auth";
import { ROUTES } from "@/constants/routes";
import { getInitials } from "@/lib/utils";
import { StaffNotificationBell } from "@/components/layouts/staff-notification-bell";

const PLAN_BADGE: Record<string, string> = {
  FREE: "bg-muted text-muted-foreground",
  STARTER: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  PRO: "bg-primary/10 text-primary",
  ENTERPRISE: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

export function Navbar() {
  const router = useRouter();
  const { setMobileSidebarOpen } = useUIStore();
  const { user, workspace, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const initials = user?.fullName ? getInitials(user.fullName) : "U";
  const plan = workspace?.plan ?? "FREE";

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="size-8 lg:hidden"
        onClick={() => setMobileSidebarOpen(true)}
      >
        <Menu className="size-4" />
      </Button>

      {/* Breadcrumb */}
      <div className="hidden flex-1 sm:block">
        <BreadcrumbNav />
      </div>
      <div className="flex-1 sm:hidden" />

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
          <Search className="size-4" />
        </Button>

        <StaffNotificationBell />

        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" className="h-8 gap-2 rounded-full px-1.5" />
            }
          >
            <Avatar className="size-6">
              <AvatarImage src={user?.avatar ?? undefined} alt={user?.fullName ?? "User"} />
              <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-24 truncate text-xs font-medium sm:block">
              {user?.fullName?.split(" ")[0] ?? "Account"}
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            {/* User info */}
            <DropdownMenuLabel className="pb-1.5">
              <p className="text-sm font-semibold leading-tight">
                {user?.fullName ?? "User"}
              </p>
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                {user?.email ?? "—"}
              </p>
            </DropdownMenuLabel>

            {/* Workspace info */}
            {workspace && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex size-6 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                      {workspace.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {workspace.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Building2 className="size-2.5 text-muted-foreground" />
                        <Badge
                          className={`h-3.5 px-1 text-[9px] font-semibold ${PLAN_BADGE[plan] ?? PLAN_BADGE["FREE"]}`}
                        >
                          {plan}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => router.push(ROUTES.SETTINGS_PROFILE)}
              >
                <User className="size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={() => router.push(ROUTES.SETTINGS)}
              >
                <Settings className="size-4" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="cursor-pointer gap-2 text-destructive"
              variant="destructive"
            >
              {isLoggingOut ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogOut className="size-4" />
              )}
              {isLoggingOut ? "Signing out…" : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
