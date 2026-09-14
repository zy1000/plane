import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@plane/hooks";

/** 「显示属性」里能开关的列，顺序即表格列顺序 */
export const STAGE_REVIEW_DISPLAY_PROPERTIES = [
  "product",
  "status",
  "result",
  "leader",
  "auditor",
  "dates",
  "attachment_count",
  "comment_count",
  "kind",
  "updated_at",
] as const;

export type TStageReviewDisplayProperty = (typeof STAGE_REVIEW_DISPLAY_PROPERTIES)[number];

/**
 * 分组方式 —— 决定**左侧分组栏**按什么分（照工作项）。默认「研发阶段」；「无」时不出分组栏，
 * 右侧直接列出项目里的全部评审。
 */
export const STAGE_REVIEW_GROUP_BY = ["stage", "product", "status", "leader", "auditor", "result", "kind", "none"] as const;

export type TStageReviewGroupBy = (typeof STAGE_REVIEW_GROUP_BY)[number];

/** `template` = 后端给的顺序（产品 → 模板排序） */
export const STAGE_REVIEW_ORDER_BY = ["template", "-created_at", "-updated_at", "start_date", "end_date"] as const;

export type TStageReviewOrderBy = (typeof STAGE_REVIEW_ORDER_BY)[number];

export type TStageReviewDisplaySettings = {
  properties: Record<TStageReviewDisplayProperty, boolean>;
  groupBy: TStageReviewGroupBy;
  orderBy: TStageReviewOrderBy;
  showActivities: boolean;
  showEmptyGroups: boolean;
};

export const DEFAULT_STAGE_REVIEW_DISPLAY: TStageReviewDisplaySettings = {
  properties: {
    product: true,
    status: true,
    result: true,
    leader: true,
    auditor: false,
    dates: true,
    attachment_count: false,
    comment_count: false,
    kind: false,
    updated_at: false,
  },
  groupBy: "stage",
  orderBy: "template",
  showActivities: true,
  showEmptyGroups: false,
};

export type TStageReviewDisplayPatch = Partial<Omit<TStageReviewDisplaySettings, "properties">> & {
  properties?: Partial<Record<TStageReviewDisplayProperty, boolean>>;
};

/**
 * 显示设置按「项目 + 人」记在本地。
 *
 * 读出来的值与默认值逐层合并：以后新加一列或一个设置项时，老用户存下来的对象里没有
 * 这个键，按默认值显示，而不是被当成关掉。
 *
 * 键带版本号：v1 时分组默认「无」且整份设置一起存，改成默认按研发阶段分组后，旧值会把
 * 默认顶掉，所以换 v2 让所有人回到默认。**改默认值时同理要升版本。**
 */
export const useStageReviewDisplay = (projectId: string, userId: string | undefined) => {
  const { storedValue, setValue } = useLocalStorage<TStageReviewDisplaySettings | null>(
    `stage-reviews-display:v2:${projectId}:${userId ?? "anonymous"}`,
    null
  );

  const settings = useMemo<TStageReviewDisplaySettings>(
    () => ({
      ...DEFAULT_STAGE_REVIEW_DISPLAY,
      ...storedValue,
      properties: { ...DEFAULT_STAGE_REVIEW_DISPLAY.properties, ...storedValue?.properties },
    }),
    [storedValue]
  );

  const updateSettings = useCallback(
    (patch: TStageReviewDisplayPatch) =>
      setValue({ ...settings, ...patch, properties: { ...settings.properties, ...patch.properties } }),
    [settings, setValue]
  );

  return { settings, updateSettings };
};
