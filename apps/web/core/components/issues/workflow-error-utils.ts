export type TIssueWorkflowUpdateError = {
  error?: string | Record<string, string | string[]>;
  workflow_blocked?: boolean;
  transition_record_id?: string | null;
};

export const isWorkflowApprovalInitiated = (errorData?: TIssueWorkflowUpdateError): boolean =>
  Boolean(errorData?.workflow_blocked && errorData?.transition_record_id);

/**
 * 从工作项更新错误响应中提取一条可展示的文案。
 * 兼容后端返回的三种结构：
 * - { error: "xxx" }
 * - { error: { field: "xxx" } }
 * - { error: { field: ["xxx", ...] } }
 */
export const extractIssueUpdateErrorMessage = (errorData?: TIssueWorkflowUpdateError): string | undefined => {
  const rawError = errorData?.error;
  if (!rawError) return undefined;
  if (typeof rawError === "string") return rawError;
  if (typeof rawError === "object") {
    for (const value of Object.values(rawError)) {
      if (typeof value === "string" && value) return value;
      if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === "string" && item);
        if (first) return first;
      }
    }
  }
  return undefined;
};
