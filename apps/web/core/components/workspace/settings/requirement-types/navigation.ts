/**
 * 工作区设置里的需求类型路径。
 *
 * 「模板管理」下的旧入口已删除，这里是需求类型唯一的落地路径。
 */
export const getSettingsRequirementTypePath = (workspaceSlug: string, requirementTypeId?: string) =>
  requirementTypeId
    ? `/${workspaceSlug}/settings/requirement-types/${requirementTypeId}`
    : `/${workspaceSlug}/settings/requirement-types`;
