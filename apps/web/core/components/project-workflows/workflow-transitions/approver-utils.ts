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

/**
 * 角色（数据字典 job_role 的值）。运行时找人：研发矩阵里这个项目 ×（工作项关联的）产品填的人优先，
 * 没填就是项目里挂了这个角色的成员。项目方案与模式方案一样用这个令牌（后端 views/workflow/base.py）。
 */
export const JOB_ROLE_PRINCIPAL_PREFIX = "job_role:";

export const buildJobRoleToken = (jobRoleId: string) => `${JOB_ROLE_PRINCIPAL_PREFIX}${jobRoleId}`;

export const isJobRoleToken = (token: string) => token.startsWith(JOB_ROLE_PRINCIPAL_PREFIX);

export const getJobRoleIdFromToken = (token: string): string | null => {
  if (!isJobRoleToken(token)) return null;
  return token.slice(JOB_ROLE_PRINCIPAL_PREFIX.length) || null;
};

export const getWorkflowApproverLabel = (
  approverId: string,
  getUserDetails?: (userId: string) => { display_name?: string | null } | undefined,
  getJobRoleName?: (jobRoleId: string) => string | undefined
) => {
  const specialOption = WORKFLOW_SPECIAL_APPROVER_OPTIONS.find((option) => option.id === approverId);
  if (specialOption) return specialOption.label;
  const jobRoleId = getJobRoleIdFromToken(approverId);
  if (jobRoleId) {
    const jobRoleName = getJobRoleName?.(jobRoleId);
    return jobRoleName ? `${jobRoleName}（角色）` : "角色";
  }
  return getUserDetails?.(approverId)?.display_name ?? "未知成员";
};
