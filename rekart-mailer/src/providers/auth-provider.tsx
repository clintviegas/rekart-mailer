"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth.store";
import { usersService } from "@/services/users.service";
import { workspaceService } from "@/services/workspace.service";
import { tokenStorage } from "@/lib/api";

/**
 * Bootstraps the authenticated session on every cold app load.
 * - If an access token exists in localStorage, re-fetches /users/me
 *   and /workspace/current to get fresh server state.
 * - If fetch fails (expired / revoked), clears auth state so the
 *   middleware redirects to /login.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setAuth, setBootstrapping, clearAuth, tokens } =
    useAuthStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const accessToken = tokenStorage.getAccess();

    if (!accessToken && !isAuthenticated) {
      setBootstrapping(false);
      return;
    }

    const bootstrap = async () => {
      try {
        const [user, workspace] = await Promise.all([
          usersService.getMe(),
          workspaceService.getCurrent(),
        ]);

        const currentTokens = tokens ?? {
          accessToken: tokenStorage.getAccess() ?? "",
          refreshToken: tokenStorage.getRefresh() ?? "",
          expiresIn: 900,
        };

        setAuth(user, workspace, currentTokens);
      } catch {
        clearAuth();
        setBootstrapping(false);
      }
    };

    bootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
