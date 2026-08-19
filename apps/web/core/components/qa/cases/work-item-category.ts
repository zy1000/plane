/**
 * 用例关联工作项的 tab 分类 → IssueTypeCategory.name。
 *
 * 后端 `test/case/issues-list/` 与 `unselect-issues/` 按 `type__category__name__in=type_name.split(',')`
 * 过滤，所以这里的值是**分类名**（工作区级系统值：需求 / 任务 / 缺陷），不是 IssueType.name。
 * 原先单独的「需求」tab（分类为需求的工作项）已并入「工作项」tab。
 */
export type TWorkItemType = "Task" | "Bug";

export const WORK_ITEM_TYPE_CATEGORY_NAMES: Record<TWorkItemType, string[]> = {
  Task: ["需求", "任务"],
  Bug: ["缺陷"],
};

/** 拼成后端 `type_name` 查询参数（逗号分隔多值） */
export const workItemTypeName = (type: TWorkItemType): string => WORK_ITEM_TYPE_CATEGORY_NAMES[type].join(",");
