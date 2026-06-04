import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useAppStore = create(
  persist(
    (set, get) => ({
      // ── Auth ────────────────────────────────────────────────
      user: null,
      session: null,
      authReady: false,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setAuthReady: (v) => set({ authReady: v }),
      clearAuth: () => set({ user: null, session: null }),

      // ── Active project ──────────────────────────────────────
      activeProject: null,
      setActiveProject: (project) => set({ activeProject: project }),

      // ── Theme ───────────────────────────────────────────────
      theme: 'dark',
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        document.documentElement.setAttribute('data-theme', next)
        set({ theme: next })
      },

      // ── Job queue (transcription / ad analysis) ─────────────
      queue: [],
      addToQueue: (item) => set((s) => ({ queue: [...s.queue, item] })),
      updateQueueItem: (id, data) =>
        set((s) => ({
          queue: s.queue.map((i) => (i.id === id ? { ...i, ...data } : i)),
        })),
      removeFromQueue: (id) =>
        set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),
      clearQueue: () => set({ queue: [] }),
    }),
    {
      name: 'tikcopy-store',
      partialize: (s) => ({ theme: s.theme, activeProject: s.activeProject, user: s.user, session: s.session }),
    }
  )
)

// Apply persisted theme on load
const { theme } = useAppStore.getState()
document.documentElement.setAttribute('data-theme', theme)

export default useAppStore
