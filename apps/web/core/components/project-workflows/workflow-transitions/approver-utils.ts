export const WORKFLOW_SPECIAL_APPROVER_IDS = {
  ASSIGNEES: "special:assignees",
  CREATED_BY: "special:created_by",
} as const;

export type TWorkflowSpecialApproverId =
  (typeof WORKFLOW_SPECIAL_APPROVER_IDS)[keyof typeof WORKFLOW_SPECIAL_APPROVER_IDS];

export const WORKFLOW_SPECIAL_APPROVER_OPTIONS: Array<{
  id: TWorkflowSpecialApproverId;
  label: string;
  description: string;
}> = [
  {
    id: WORKFLOW_SPECIAL_APPROVER_IDS.ASSIGNEES,
    label: "工作项负责人",
    description: "审批时自动加入当前工作项负责人",
  },
  {
    id: WORKFLOW_SPECIAL_APPROVER_IDS.CREATED_BY,
    label: "工作项创建人",
    description: "审批时自动加入当前工作项创建人",
  },
];

export const getWorkflowApproverLabel = (
  approverId: string,
  getUserDetails?: (userId: string) => { display_name?: string | null } | undefined
) => {
  const specialOption = WORKFLOW_SPECIAL_APPROVER_OPTIONS.find((option) => option.id === approverId);
  if (specialOption) return specialOption.label;
  return getUserDetails?.(approverId)?.display_name ?? "未知成员";
};
