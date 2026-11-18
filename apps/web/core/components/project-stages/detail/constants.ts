/** 右侧阶段信息栏是否收起，记在 localStorage（页头的开关与正文共用） */
export const PROJECT_STAGE_SIDEBAR_COLLAPSED_KEY = "stage_sidebar_collapsed";

/** 工作项筛选实例的 id，与 HeaderFilters 里 `${projectId}_${scope}` 的规则一致 */
export const getProjectStageFilterEntityId = (projectId: string) => `${projectId}_stage`;
