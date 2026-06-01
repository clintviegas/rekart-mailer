// Workspace state is now managed inside auth.store.ts
// This file is kept for sidebar multi-workspace UI state only

import { create } from "zustand";

interface WorkspaceUIStore {
  isSwitching: boolean;
  setSwitching: (v: boolean) => void;
}

export const useWorkspaceUIStore = create<WorkspaceUIStore>((set) => ({
  isSwitching: false,
  setSwitching: (isSwitching) => set({ isSwitching }),
}));
