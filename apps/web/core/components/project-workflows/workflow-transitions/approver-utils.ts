export const WORKFLOW_SPECIAL_APPROVER_IDS = {
  ASSIGNEES: "special:assignees",
  CREATED_BY: "special:created_by",
} as const;

export const ROLE_PRINCIPAL_PREFIX = "role:";

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

export const buildRoleToken = (roleId: string) => `${ROLE_PRINCIPAL_PREFIX}${roleId}`;

export const isRoleToken = (token: string) => token.startsWith(ROLE_PRINCIPAL_PREFIX);

export const getRoleIdFromToken = (token: string): string | null => {
  if (!isRoleToken(token)) return null;
  const roleId = token.slice(ROLE_PRINCIPAL_PREFIX.length);
  return roleId || null;
};

export const getWorkflowApproverLabel = (
  approverId: string,
  getUserDetails?: (userId: string) => { display_name?: string | null } | undefined,
  getRoleName?: (roleId: string) => string | undefined
) => {
  const specialOption = WORKFLOW_SPECIAL_APPROVER_OPTIONS.find((option) => option.id === approverId);
  if (specialOption) return specialOption.label;
  const roleId = getRoleIdFromToken(approverId);
  if (roleId) {
    const roleName = getRoleName?.(roleId);
    return roleName ? `${roleName}（角色）` : "项目角色";
  }
  return getUserDetails?.(approverId)?.display_name ?? "未知成员";
};
