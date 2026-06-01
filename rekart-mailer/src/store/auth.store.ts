import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User, Workspace, AuthTokens } from "@/types/auth";
import { tokenStorage } from "@/lib/api";

interface AuthStore {
  // State
  user: User | null;
  workspace: Workspace | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;

  // Actions
  setAuth: (user: User, workspace: Workspace, tokens: AuthTokens) => void;
  setUser: (user: User) => void;
  setWorkspace: (workspace: Workspace) => void;
  setBootstrapping: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      workspace: null,
      tokens: null,
      isAuthenticated: false,
      isBootstrapping: true,

      setAuth: (user, workspace, tokens) => {
        tokenStorage.setTokens(tokens.accessToken, tokens.refreshToken);
        set({ user, workspace, tokens, isAuthenticated: true, isBootstrapping: false });
      },

      setUser: (user) => set({ user }),

      setWorkspace: (workspace) => set({ workspace }),

      setBootstrapping: (isBootstrapping) => set({ isBootstrapping }),

      clearAuth: () => {
        tokenStorage.clearTokens();
        set({
          user: null,
          workspace: null,
          tokens: null,
          isAuthenticated: false,
          isBootstrapping: false,
        });
      },
    }),
    {
      name: "rekart-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        workspace: state.workspace,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
