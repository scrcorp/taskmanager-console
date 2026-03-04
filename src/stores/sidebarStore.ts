/**
 * 사이드바 전역 상태 스토어 (Zustand).
 *
 * 모바일 화면(md 이하)에서 사이드바 열림/닫힘 상태를 관리합니다.
 * 데스크톱에서는 사이드바가 항상 표시되므로 이 상태는 모바일에서만 사용됩니다.
 */
import { create } from "zustand";

/** 사이드바 상태 인터페이스 */
interface SidebarState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
