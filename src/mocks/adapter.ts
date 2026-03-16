/**
 * Mock Axios 어댑터 -- URL 패턴에 따라 mock 데이터를 반환합니다.
 * 서버 없이 모든 페이지를 테스트할 수 있게 합니다.
 *
 * Mock Axios adapter that intercepts requests and returns mock data
 * based on URL patterns. Enables full page testing without a backend server.
 */

import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  mockMe,
  mockRoles,
  mockStores,
  mockStoreDetails,
  mockShifts,
  mockPositions,
  mockUsers,
  mockUserStores,
  mockTemplates,
  mockChecklistItems,
  mockAnnouncements,
  mockTasks,
  mockNotifications,
} from "./data";
import type { PaginatedResponse } from "@/types";

/** Mock 모드 활성 여부 확인 (Check if mock mode is enabled) */
export const isMockMode = (): boolean =>
  process.env.NEXT_PUBLIC_USE_MOCK === "true";

/** 짧은 지연을 시뮬레이션 (Simulate network latency) */
const delay = (ms: number = 200): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 페이지네이션 헬퍼 (Pagination helper) */
function paginate<T>(
  items: T[],
  page: number = 1,
  perPage: number = 20,
): PaginatedResponse<T> {
  const start: number = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total: items.length,
    page,
    per_page: perPage,
  };
}

/** UUID 생성 헬퍼 (Simple ID generator) */
const newId = (): string =>
  `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** mock 응답 생성 (Build a mock AxiosResponse) */
function mockResponse<T>(
  data: T,
  config: InternalAxiosRequestConfig,
): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  };
}

/**
 * URL 패턴 매칭으로 mock 응답 반환 (Route request to mock data by URL pattern).
 *
 * @param config - Axios 요청 설정 (Axios request config)
 * @returns Mock AxiosResponse
 */
export async function handleMockRequest(
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  await delay(150 + Math.random() * 200);

  const url: string = config.url ?? "";
  const method: string = (config.method ?? "get").toLowerCase();
  const params: Record<string, string> = (config.params as Record<string, string>) ?? {};

  // ─── Auth ──────────────────────────────────────

  if (url.endsWith("/admin/auth/login") && method === "post") {
    return mockResponse(
      { access_token: "mock-access-token", refresh_token: "mock-refresh-token", token_type: "bearer" },
      config,
    );
  }

  if (url.endsWith("/auth/me")) {
    return mockResponse(mockMe, config);
  }

  if (url.endsWith("/auth/refresh") && method === "post") {
    return mockResponse(
      { access_token: "mock-access-token-refreshed", refresh_token: "mock-refresh-token-refreshed", token_type: "bearer" },
      config,
    );
  }

  // ─── Roles ─────────────────────────────────────

  if (url.endsWith("/admin/roles") && method === "get") {
    return mockResponse(mockRoles, config);
  }

  if (url.endsWith("/admin/roles") && method === "post") {
    const body = JSON.parse(config.data as string);
    return mockResponse({ id: newId(), ...body, created_at: new Date().toISOString() }, config);
  }

  // Role update/delete
  const roleMatch: RegExpMatchArray | null = url.match(/\/admin\/roles\/([^/]+)$/);
  if (roleMatch) {
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      const existing = mockRoles.find((r) => r.id === roleMatch[1]);
      return mockResponse({ ...existing, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Stores ────────────────────────────────────

  if (url.endsWith("/admin/stores") && method === "get") {
    return mockResponse(mockStores, config);
  }

  if (url.endsWith("/admin/stores") && method === "post") {
    const body = JSON.parse(config.data as string);
    return mockResponse(
      { id: newId(), organization_id: "org-001", is_active: true, created_at: new Date().toISOString(), ...body },
      config,
    );
  }

  // Store detail / update / delete
  const storeMatch: RegExpMatchArray | null = url.match(/\/admin\/stores\/([^/]+)$/);
  if (storeMatch) {
    const storeId: string = storeMatch[1];
    if (method === "get") {
      return mockResponse(mockStoreDetails[storeId] ?? mockStores.find((b) => b.id === storeId) ?? mockStoreDetails[mockStores[0].id], config);
    }
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      const existing = mockStores.find((b) => b.id === storeId);
      return mockResponse({ ...existing, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Shifts ────────────────────────────────────

  const shiftsMatch: RegExpMatchArray | null = url.match(/\/admin\/stores\/([^/]+)\/shifts$/);
  if (shiftsMatch) {
    const storeId: string = shiftsMatch[1];
    if (method === "get") {
      return mockResponse(mockShifts[storeId] ?? [], config);
    }
    if (method === "post") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: newId(), store_id: storeId, sort_order: 0, ...body }, config);
    }
  }

  const shiftItemMatch: RegExpMatchArray | null = url.match(/\/admin\/stores\/([^/]+)\/shifts\/([^/]+)$/);
  if (shiftItemMatch) {
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: shiftItemMatch[2], store_id: shiftItemMatch[1], name: "Updated Shift", sort_order: 0, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Positions ─────────────────────────────────

  const positionsMatch: RegExpMatchArray | null = url.match(/\/admin\/stores\/([^/]+)\/positions$/);
  if (positionsMatch) {
    const storeId: string = positionsMatch[1];
    if (method === "get") {
      return mockResponse(mockPositions[storeId] ?? [], config);
    }
    if (method === "post") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: newId(), store_id: storeId, sort_order: 0, ...body }, config);
    }
  }

  const posItemMatch: RegExpMatchArray | null = url.match(/\/admin\/stores\/([^/]+)\/positions\/([^/]+)$/);
  if (posItemMatch) {
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: posItemMatch[2], store_id: posItemMatch[1], name: "Updated Position", sort_order: 0, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── All Checklist Templates (cross-store) ─────

  if (url.endsWith("/admin/checklist-templates") && method === "get") {
    let allTemplates = Object.values(mockTemplates).flat();
    if (params.store_id) allTemplates = allTemplates.filter((t) => t.store_id === params.store_id);
    if (params.shift_id) allTemplates = allTemplates.filter((t) => t.shift_id === params.shift_id);
    if (params.position_id) allTemplates = allTemplates.filter((t) => t.position_id === params.position_id);
    return mockResponse(allTemplates, config);
  }

  // ─── Checklist Templates (per-store) ──────────

  const templatesMatch: RegExpMatchArray | null = url.match(/\/admin\/stores\/([^/]+)\/checklist-templates$/);
  if (templatesMatch) {
    const storeId: string = templatesMatch[1];
    if (method === "get") {
      return mockResponse(mockTemplates[storeId] ?? [], config);
    }
    if (method === "post") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: newId(), store_id: storeId, item_count: 0, shift_name: "", position_name: "", ...body }, config);
    }
  }

  const templateItemMatch: RegExpMatchArray | null = url.match(/\/admin\/checklist-templates\/([^/]+)$/);
  if (templateItemMatch && !url.includes("/items")) {
    if (method === "get") {
      const allTemplates = Object.values(mockTemplates).flat();
      return mockResponse(allTemplates.find((t) => t.id === templateItemMatch[1]) ?? allTemplates[0], config);
    }
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: templateItemMatch[1], store_id: "store-001", item_count: 0, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Checklist Items ───────────────────────────

  const checklistItemsMatch: RegExpMatchArray | null = url.match(/\/admin\/checklist-templates\/([^/]+)\/items$/);
  if (checklistItemsMatch) {
    const templateId: string = checklistItemsMatch[1];
    if (method === "get") {
      return mockResponse(mockChecklistItems[templateId] ?? [], config);
    }
    if (method === "post") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: newId(), sort_order: 0, verification_type: "none", description: null, ...body }, config);
    }
  }

  const checklistItemMatch: RegExpMatchArray | null = url.match(/\/admin\/checklist-template-items\/([^/]+)$/);
  if (checklistItemMatch) {
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      return mockResponse({ id: checklistItemMatch[1], title: "Updated Item", sort_order: 0, verification_type: "none", description: null, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Users ─────────────────────────────────────

  if (url.endsWith("/admin/users") && method === "get") {
    return mockResponse(mockUsers, config);
  }

  if (url.endsWith("/admin/users") && method === "post") {
    const body = JSON.parse(config.data as string);
    return mockResponse(
      { id: newId(), role_name: "Staff", role_priority: 40, is_active: true, created_at: new Date().toISOString(), ...body },
      config,
    );
  }

  // User detail / update / delete
  const userActiveMatch: RegExpMatchArray | null = url.match(/\/admin\/users\/([^/]+)\/active$/);
  if (userActiveMatch && method === "patch") {
    return mockResponse(null, config);
  }

  const userStoresMatch: RegExpMatchArray | null = url.match(/\/admin\/users\/([^/]+)\/stores\/([^/]+)$/);
  if (userStoresMatch) {
    return mockResponse(null, config);
  }

  const userStoresListMatch: RegExpMatchArray | null = url.match(/\/admin\/users\/([^/]+)\/stores$/);
  if (userStoresListMatch && method === "get") {
    return mockResponse(mockUserStores[userStoresListMatch[1]] ?? [], config);
  }

  const userMatch: RegExpMatchArray | null = url.match(/\/admin\/users\/([^/]+)$/);
  if (userMatch) {
    const userId: string = userMatch[1];
    if (method === "get") {
      return mockResponse(mockUsers.find((u) => u.id === userId) ?? mockUsers[0], config);
    }
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      const existing = mockUsers.find((u) => u.id === userId);
      return mockResponse({ ...existing, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Announcements ─────────────────────────────

  if (url.endsWith("/admin/announcements") && method === "get") {
    const page: number = parseInt(params.page ?? "1", 10);
    const perPage: number = parseInt(params.per_page ?? "20", 10);
    return mockResponse(paginate(mockAnnouncements, page, perPage), config);
  }

  if (url.endsWith("/admin/announcements") && method === "post") {
    const body = JSON.parse(config.data as string);
    return mockResponse(
      { id: newId(), ...body, store_name: null, created_by_name: "Admin User", created_at: new Date().toISOString() },
      config,
    );
  }

  const annMatch: RegExpMatchArray | null = url.match(/\/admin\/announcements\/([^/]+)$/);
  if (annMatch) {
    const annId: string = annMatch[1];
    if (method === "get") {
      return mockResponse(mockAnnouncements.find((a) => a.id === annId) ?? mockAnnouncements[0], config);
    }
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      const existing = mockAnnouncements.find((a) => a.id === annId);
      return mockResponse({ ...existing, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Tasks ─────────────────────────────────────

  if (url.endsWith("/admin/additional-tasks") && method === "get") {
    let filtered = [...mockTasks];
    if (params.status) filtered = filtered.filter((t) => t.status === params.status);
    if (params.priority) filtered = filtered.filter((t) => t.priority === params.priority);
    const page: number = parseInt(params.page ?? "1", 10);
    const perPage: number = parseInt(params.per_page ?? "20", 10);
    return mockResponse(paginate(filtered, page, perPage), config);
  }

  if (url.endsWith("/admin/additional-tasks") && method === "post") {
    const body = JSON.parse(config.data as string);
    return mockResponse(
      { id: newId(), ...body, store_name: null, created_by_name: "Admin User", assignee_names: [], status: "pending", created_at: new Date().toISOString() },
      config,
    );
  }

  const taskMatch: RegExpMatchArray | null = url.match(/\/admin\/additional-tasks\/([^/]+)$/);
  if (taskMatch) {
    const taskId: string = taskMatch[1];
    if (method === "get") {
      return mockResponse(mockTasks.find((t) => t.id === taskId) ?? mockTasks[0], config);
    }
    if (method === "put") {
      const body = JSON.parse(config.data as string);
      const existing = mockTasks.find((t) => t.id === taskId);
      return mockResponse({ ...existing, ...body }, config);
    }
    if (method === "delete") {
      return mockResponse(null, config);
    }
  }

  // ─── Notifications ─────────────────────────────

  if (url.endsWith("/admin/notifications/unread-count") && method === "get") {
    const unreadCount: number = mockNotifications.filter((n) => !n.is_read).length;
    return mockResponse({ unread_count: unreadCount }, config);
  }

  if (url.endsWith("/admin/notifications/read-all") && method === "patch") {
    return mockResponse(null, config);
  }

  if (url.endsWith("/admin/notifications") && method === "get") {
    const page: number = parseInt(params.page ?? "1", 10);
    const perPage: number = parseInt(params.per_page ?? "20", 10);
    return mockResponse(paginate(mockNotifications, page, perPage), config);
  }

  const notifReadMatch: RegExpMatchArray | null = url.match(/\/admin\/notifications\/([^/]+)\/read$/);
  if (notifReadMatch && method === "patch") {
    return mockResponse(null, config);
  }

  // ─── Fallback ──────────────────────────────────

  console.warn(`[Mock] Unhandled request: ${method.toUpperCase()} ${url}`);
  return mockResponse(null, config);
}
