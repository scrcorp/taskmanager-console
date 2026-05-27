import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

interface AttendanceLatestVersion {
  version: string;
  channel: string;
  download_url: string;
  released_at: string;
}

/** console 안의 attendances 페이지 버튼용 — 인증된 endpoint. */
export function useAttendanceLatestVersion() {
  return useQuery<AttendanceLatestVersion>({
    queryKey: ["app-versions", "attendance", "latest"],
    queryFn: () =>
      api
        .get<AttendanceLatestVersion>("/console/app-versions/attendance/latest")
        .then((r) => r.data),
    staleTime: 1000 * 60 * 10, // 10분 캐시 — 자주 바뀌지 않음
    retry: false,
  });
}

/** public `/htma-download` 페이지용 — 인증 없이 호출. */
export function usePublicAttendanceLatestVersion() {
  return useQuery<AttendanceLatestVersion>({
    queryKey: ["public", "releases", "attendance", "latest"],
    queryFn: () =>
      api
        .get<AttendanceLatestVersion>("/public/releases/attendance/latest")
        .then((r) => r.data),
    staleTime: 1000 * 60 * 10,
    retry: false,
  });
}
