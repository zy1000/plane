import { useCallback, useMemo } from "react";
import { useLocalStorage } from "@plane/hooks";
import type { TStageReviewScopeKind } from "../scope";
import { STAGE_REVIEW_SCOPE_HIDDEN_DIMENSION } from "../scope";

/** 「显示属性」里能开关的列，顺序即表格列顺序。`product` 只在项目页出现，`project` 只在产品页出现 */
export const STAGE_REVIEW_DISPLAY_PROPERTIES = [
  "product",
  "project",
  "status",
  "result",
  "leader",
  "auditor",
  "dates",
  "attachment_count",
  "comment_count",
  "kind",
  "tailoring",
  "updated_at",
] as const;

export type TStageReviewDisplayProperty = (typeof STAGE_REVIEW_DISPLAY_PROPERTIES)[number];

/**
 * 表格实际渲染的列。比显示属性多一个 `stage`：产品页按项目分组时，「项目」列没有意义，
 * 换成「研发阶段」列（不进显示属性，用户不能单独开关）。
 */
export type TStageReviewColumn = TStageReviewDisplayProperty | "stage";

/**
 * 分组方式 —— 决定**左侧分组栏**按什么分（照工作项）。默认见 `DEFAULT_STAGE_REVIEW_GROUP_BY`；
 * 「无」时不出分组栏，右侧直接列出全部评审。
 */
export const STAGE_REVIEW_GROUP_BY = [
  "stage",
  "product",
  "project",
  "status",
  "leader",
  "auditor",
  "result",
  "kind",
  "none",
] as const;

export type TStageReviewGroupBy = (typeof STAGE_REVIEW_GROUP_BY)[number];

/**
 * 默认分组方式按作用域分：项目页按「产品」分组；产品页没有「产品」这一维，退回「研发阶段」。
 */
export const DEFAULT_STAGE_REVIEW_GROUP_BY: Record<TStageReviewScopeKind, TStageReviewGroupBy> = {
  project: "product",
  product: "stage",
};

/** `template` = 后端给的顺序（产品 / 项目 → 模板排序） */
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
    project: true,
    status: true,
    result: true,
    leader: true,
    auditor: false,
    dates: true,
    attachment_count: false,
    comment_count: false,
    kind: false,
    // 同一产品的同一评审在多张裁剪表里都保留时会各生成一条，标题完全一样，默认开着这列才分得开
    tailoring: true,
    updated_at: false,
  },
  groupBy: DEFAULT_STAGE_REVIEW_GROUP_BY.project,
  orderBy: "template",
  showActivities: true,
  showEmptyGroups: false,
};

/** 这个作用域下可开关的显示属性（去掉作用域自己那一维） */
export const getStageReviewDisplayProperties = (scopeKind: TStageReviewScopeKind): TStageReviewDisplayProperty[] =>
  STAGE_REVIEW_DISPLAY_PROPERTIES.filter((property) => property !== STAGE_REVIEW_SCOPE_HIDDEN_DIMENSION[scopeKind]);

/** 这个作用域下可选的分组方式（去掉作用域自己那一维） */
export const getStageReviewGroupByOptions = (scopeKind: TStageReviewScopeKind): TStageReviewGroupBy[] =>
  STAGE_REVIEW_GROUP_BY.filter((groupBy) => groupBy !== STAGE_REVIEW_SCOPE_HIDDEN_DIMENSION[scopeKind]);

export type TStageReviewDisplayPatch = Partial<Omit<TStageReviewDisplaySettings, "properties">> & {
  properties?: Partial<Record<TStageReviewDisplayProperty, boolean>>;
};

/**
 * 显示设置按「作用域 + 人」记在本地（`storageScope` 见 `getStageReviewStorageScope`，项目侧仍是
 * 裸 projectId，老用户的设置不丢）。
 *
 * 读出来的值与默认值逐层合并：以后新加一列或一个设置项时，老用户存下来的对象里没有
 * 这个键，按默认值显示，而不是被当成关掉。
 *
 * 键带版本号：v1 时分组默认「无」且整份设置一起存，改成默认按研发阶段分组后，旧值会把
 * 默认顶掉，所以换 v2 让所有人回到默认；项目页默认改成按产品分组时同理换 v3；「来源裁剪表」列
 * 默认打开时换 v4。**改默认值时同理要升版本。**
 */
export const useStageReviewDisplay = (
  storageScope: string,
  scopeKind: TStageReviewScopeKind,
  userId: string | undefined
) => {
  const { storedValue, setValue } = useLocalStorage<TStageReviewDisplaySettings | null>(
    `stage-reviews-display:v4:${storageScope}:${userId ?? "anonymous"}`,
    null
  );

  const settings = useMemo<TStageReviewDisplaySettings>(() => {
    const merged = {
      ...DEFAULT_STAGE_REVIEW_DISPLAY,
      groupBy: DEFAULT_STAGE_REVIEW_GROUP_BY[scopeKind],
      ...storedValue,
      properties: { ...DEFAULT_STAGE_REVIEW_DISPLAY.properties, ...storedValue?.properties },
    };
    // 作用域自己那一维不能当分组（比如产品页存进了「按产品」），落回默认
    if (merged.groupBy === STAGE_REVIEW_SCOPE_HIDDEN_DIMENSION[scopeKind]) {
      merged.groupBy = DEFAULT_STAGE_REVIEW_GROUP_BY[scopeKind];
    }
    return merged;
  }, [storedValue, scopeKind]);

  const updateSettings = useCallback(
    (patch: TStageReviewDisplayPatch) =>
      setValue({ ...settings, ...patch, properties: { ...settings.properties, ...patch.properties } }),
    [settings, setValue]
  );

  return { settings, updateSettings };
};
