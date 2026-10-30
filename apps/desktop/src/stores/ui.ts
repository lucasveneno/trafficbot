import { create } from 'zustand'
export const useUI = create<{ page: string; dark: boolean; logFilter: string; setLogFilter: (filter: string) => void; navigate: (page: string) => void; toggle: () => void }>(set => ({
  logFilter: '', setLogFilter: logFilter => set({ logFilter, page: 'Logs' }),
  page: 'Dashboard', dark: localStorage.getItem('trafficbot-theme') !== 'light',
  navigate: page => set({ page }), toggle: () => set(state => { localStorage.setItem('trafficbot-theme', state.dark ? 'light' : 'dark'); return { dark: !state.dark } }),
}))
