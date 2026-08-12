/**
 * authStore 테스트 — Zustand 인증 스토어 동작 검증.
 *
 * 테스트 범위:
 * - 초기 상태 (user: null, isLoading: false)
 * - login: API 호출 → 토큰 저장 → 사용자 정보 조회 → 상태 업데이트
 * - login 실패: 에러 throw + isLoading false 복원
 * - logout: 사용자 정보 + 토큰 초기화
 * - fetchMe: 사용자 정보 조회 성공/실패 시 상태 업데이트
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "@/stores/authStore";

// API 모듈 모킹 — post(login), get(fetchMe) 사용
vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

// Mock window.location
const mockLocation = { href: "" };
Object.defineProperty(globalThis, "window", {
  value: { location: mockLocation, localStorage: globalThis.localStorage },
  writable: true,
});

describe("authStore", () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({ user: null, isLoading: false });
    mockLocation.href = "";
    vi.clearAllMocks();
  });

  it("has correct initial state", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it("login sets user after successful call", async () => {
    const { default: api } = await import("@/lib/api");
    const mockUser = {
      id: "1",
      username: "admin",
      full_name: "Admin User",
      email: null,
      phone: null,
      role_name: "admin",
      role_priority: 1,
      organization_id: "org1",
      organization_name: "Test Org",
      company_code: "TEST01",
      is_active: true,
    };

    vi.mocked(api.post).mockResolvedValueOnce({
      data: { access_token: "tok", refresh_token: "ref", token_type: "bearer" },
    });
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockUser });

    await useAuthStore.getState().login("admin", "pass");

    const state = useAuthStore.getState();
    expect(state.user?.username).toBe("admin");
    expect(state.isLoading).toBe(false);
  });

  it("login throws on API error", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockRejectedValueOnce(new Error("401"));

    await expect(useAuthStore.getState().login("bad", "pass")).rejects.toThrow();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it("logout clears user and tokens", () => {
    useAuthStore.setState({
      user: { id: "1", username: "a" } as any,
    });

    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("fetchMe updates user on success", async () => {
    const { default: api } = await import("@/lib/api");
    const mockUser = {
      id: "1",
      username: "admin",
      full_name: "Admin",
      role_name: "admin",
      role_priority: 1,
    };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockUser });

    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user?.username).toBe("admin");
  });

  // fetchMe 는 401/403 일 때만 로그아웃시킨다. 네트워크 오류로 세션을 날리면
  // 잠깐 끊긴 것만으로 사용자가 튕겨나가므로, status 를 실제로 확인한다.
  it("fetchMe clears user on 401", async () => {
    const { default: api } = await import("@/lib/api");
    useAuthStore.setState({ user: { id: "1" } as any });
    vi.mocked(api.get).mockRejectedValueOnce({ response: { status: 401 } });

    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("fetchMe keeps user on network error", async () => {
    const { default: api } = await import("@/lib/api");
    useAuthStore.setState({ user: { id: "1" } as any });
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Network Error"));

    await useAuthStore.getState().fetchMe();
    expect(useAuthStore.getState().user).not.toBeNull();
  });
});
