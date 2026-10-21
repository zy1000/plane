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

/**
 * 工作区角色模板（项目角色模板）。模式方案没有项目角色，只能选它；运行时解析到项目里由该模板派生的角色。
 * 项目自定义的工作流里也可能有（脱离时从模式方案拷过来的）。与 "role:" 前缀不冲突。
 */
export const ROLE_TEMPLATE_PRINCIPAL_PREFIX = "role_template:";

export const buildRoleTemplateToken = (templateId: string) => `${ROLE_TEMPLATE_PRINCIPAL_PREFIX}${templateId}`;

export const isRoleTemplateToken = (token: string) => token.startsWith(ROLE_TEMPLATE_PRINCIPAL_PREFIX);

export const getRoleTemplateIdFromToken = (token: string): string | null => {
  if (!isRoleTemplateToken(token)) return null;
  return token.slice(ROLE_TEMPLATE_PRINCIPAL_PREFIX.length) || null;
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
