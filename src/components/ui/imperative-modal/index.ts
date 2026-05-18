/**
 * Imperative modal system — barrel export.
 *
 * 사용 측은 여기서 useModal 만 import:
 *   import { useModal } from "@/components/ui/imperative-modal";
 *
 * Provider 는 한 번만 — src/app/providers.tsx 에 마운트되어 있음.
 *
 * 기존 useResultModal / useMutationResult 와 공존 — 점진 이관 중.
 */

export { ModalProvider } from "./ModalProvider";
export { useModal } from "./useModal";
export type {
  ModalApi,
  ModalShellOptions,
  ModalSize,
  ModalPresentation,
  AlertProps,
  ConfirmProps,
  OpenHandlers,
} from "./types";
