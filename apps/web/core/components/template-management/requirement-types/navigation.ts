/**
 * 模板中心里需求类型与需求通用字段库的路径。
 *
 * 需求类型先后在「模板管理」和「工作区设置」落过脚，旧地址都由
 * app/routes/redirects/core/requirement-types.tsx 跳到这里。
 */
export const getRequirementTypePath = (workspaceSlug: string, requirementTypeId?: string) =>
  requirementTypeId
    ? `/${workspaceSlug}/templates/requirement-types/${requirementTypeId}`
    : `/${workspaceSlug}/templates/requirement-types`;

/** 带 fieldId 时进页面直接打开该字段的编辑弹窗 */
export const getRequirementFieldLibraryPath = (workspaceSlug: string, fieldId?: string) =>
  `/${workspaceSlug}/templates/requirement-fields${fieldId ? `?field=${fieldId}` : ""}`;
