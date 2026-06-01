"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { authService } from "@/services/auth.service";
import { ROUTES } from "@/constants/routes";

export function useAuth() {
  const router = useRouter();
  const store = useAuthStore();

  const logout = async () => {
    const refreshToken = store.tokens?.refreshToken;
    try {
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
    } catch {
      // Silent — clear local state regardless
    } finally {
      store.clearAuth();
      router.push(ROUTES.LOGIN);
    }
  };

  return {
    user: store.user,
    workspace: store.workspace,
    tokens: store.tokens,
    isAuthenticated: store.isAuthenticated,
    isBootstrapping: store.isBootstrapping,
    setAuth: store.setAuth,
    setUser: store.setUser,
    setWorkspace: store.setWorkspace,
    clearAuth: store.clearAuth,
    logout,
  };
}
