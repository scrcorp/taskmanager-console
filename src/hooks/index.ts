/**
 * 훅 배럴 내보내기 -- 모든 React Query 커스텀 훅을 내보냅니다.
 *
 * Barrel export for all React Query custom hooks.
 */

export { useStores, useStore, useCreateStore, useUpdateStore, useDeleteStore } from "./useStores";

export {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useToggleUserActive,
  useDeleteUser,
  useUserStores,
  useAddUserStore,
  useRemoveUserStore,
} from "./useUsers";

export { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from "./useRoles";

export {
  useShifts,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
} from "./useShifts";

export {
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
} from "./usePositions";

export {
  useAllChecklistTemplates,
  useChecklistTemplates,
  useChecklistTemplate,
  useCreateChecklistTemplate,
  useUpdateChecklistTemplate,
  useDeleteChecklistTemplate,
  useChecklistItems,
  useCreateChecklistItem,
  useBulkCreateChecklistItems,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from "./useChecklists";

export {
  useAnnouncements,
  useAnnouncement,
  useAnnouncementReads,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
} from "./useAnnouncements";

export {
  useTasks,
  useTask,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useTaskEvidences,
} from "./useTasks";

export {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
} from "./useNotifications";

export { usePermissions } from "./usePermissions";
export { useAllPermissions, useRolePermissions, useUpdateRolePermissions } from "./usePermissionAdmin";

export {
  useChecklistInstances,
  useChecklistInstance,
  useChecklistInstanceBySchedule,
  useUpsertItemReview,
  useDeleteItemReview,
  usePresignedUrl,
} from "./useChecklistInstances";

export { useSchedule, useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule, useGenerateFromRequests } from "./useSchedules";

export {
  useAttendances,
  useAttendance,
  useCorrectAttendance,
  useAddBreakSession,
  useUpdateBreakSession,
  useDeleteBreakSession,
  useStoreQRCode,
  useCreateQRCode,
  useRegenerateQRCode,
} from "./useAttendances";

export {
  useAttendanceDevices,
  useUpdateAttendanceDevice,
  useRevokeAttendanceDevice,
  useAccessCode,
  useRotateAccessCode,
} from "./useAttendanceDevices";

export { useClockinPin, useRegenerateClockinPin } from "./useClockinPin";

export {
  useShiftPresets,
  useCreateShiftPreset,
  useUpdateShiftPreset,
  useDeleteShiftPreset,
} from "./useShiftPresets";

export { useLaborLaw, useUpsertLaborLaw } from "./useLaborLaw";

export {
  useChecklistCompletion,
  useAttendanceSummary,
  useOvertimeSummary,
  useEvaluationSummary,
} from "./useDashboard";

export {
  useEvalTemplates,
  useEvalTemplate,
  useCreateEvalTemplate,
  useDeleteEvalTemplate,
  useEvaluations,
  useEvaluation,
  useCreateEvaluation,
  useSubmitEvaluation,
} from "./useEvaluations";

export { useCompletionLog } from "./useCompletionLog";

export { useOvertimeAlerts } from "./useOvertimeAlerts";

export {
  useDailyReports,
  useDailyReport,
  useAddDailyReportComment,
} from "./useDailyReports";

export { useOrganization, useUpdateOrganization } from "./useOrganization";

export {
  useFindUsername,
  useFindUsernameSendCode,
  useFindUsernameVerifyCode,
  useResetPasswordSendCode,
  useResetPasswordVerifyCode,
  useResetPasswordConfirm,
  useChangePassword,
  useAdminResetPassword,
} from "./usePassword";

export { useTimezone } from "./useTimezone";

export { useDebounce } from "./useDebounce";

export { useWorkRoles, useCreateWorkRole, useUpdateWorkRole, useDeleteWorkRole } from "./useWorkRoles";
export { useBreakRule, useUpsertBreakRule } from "./useBreakRules";
export { useSchedulePeriods, useCreateSchedulePeriod, useUpdateSchedulePeriod, useTransitionPeriod } from "./useSchedulePeriods";
export { useScheduleRequests, useUpdateRequestStatus } from "./useScheduleRequests";

export {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useSubUnits,
  useCreateSubUnit,
  useUpdateSubUnit,
  useDeleteSubUnit,
  useDownloadProductTemplate,
  useImportProducts,
  useGenerateProductCode,
  useProducts,
  useProduct,
  useCreateProduct,
  useUpdateProduct,
  useDeactivateProduct,
  useActivateProduct,
  useDeleteProduct,
  useRemoveStoreInventoryItem,
  useStoreInventory,
  useStoreInventorySummary,
  useBulkAddStoreInventory,
  useUpdateStoreInventoryItem,
  useStoreTransactions,
  useCreateTransaction,
  useBulkStockIn,
  useBulkStockOut,
  useStoreAudits,
  useAuditDetail,
  useAuditSettings,
  useUpdateAuditSettings,
} from "./useInventory";
