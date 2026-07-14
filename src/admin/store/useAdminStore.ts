import { create } from 'zustand';
import type { AdminMe } from '../api/adminConsole';
import { fetchAdminMe } from '../api/adminConsole';

interface AdminStoreState {
  me: AdminMe | null;
  loading: boolean;
  forbidden: boolean;

  bootstrap: () => Promise<void>;
}

export const useAdminStore = create<AdminStoreState>((set) => ({
  me: null,
  loading: true,
  forbidden: false,

  bootstrap: async () => {
    set({ loading: true });
    const env = await fetchAdminMe().catch((e: unknown) => {
      const status = (e as { status?: number })?.status;
      if (status === 403 || status === 401) {
        set({ forbidden: true, loading: false });
      }
      return null;
    });
    if (env?.success && env.data) {
      set({ me: env.data, loading: false });
    } else {
      set({ loading: false });
    }
  },
}));
