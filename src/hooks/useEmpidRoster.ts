import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";

/**
 * EMPID roster hook — current per-store empid assignments for the bulk editor.
 *
 * Server: GET /console/empid-import/roster (permission users:read).
 * Live stores in sort_order; members sorted by empid ascending (no number last).
 * Types are defined here — the shape is local to the EMPID feature.
 */

/** One member row of a store's roster. */
export interface EmpidRosterMember {
  user_id: string;
  full_name: string;
  email: string | null;
  /** Current empid in this store (null = no number yet). */
  empid: number | null;
  /** false = dormant — has the assignment row but stays out of work assignment. */
  is_work_assignment: boolean;
  is_manager: boolean;
}

/** One store with its member roster. */
export interface EmpidRosterStore {
  store_id: string;
  store_name: string;
  group_id: string | null;
  members: EmpidRosterMember[];
}

/** Fetch the per-store empid roster. */
export const useEmpidRoster = (): UseQueryResult<EmpidRosterStore[], Error> => {
  return useQuery<EmpidRosterStore[], Error>({
    queryKey: ["empid-roster"],
    queryFn: async (): Promise<EmpidRosterStore[]> => {
      const response: AxiosResponse<EmpidRosterStore[]> = await api.get(
        "/console/empid-import/roster",
      );
      return response.data;
    },
  });
};
