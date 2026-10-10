import { useEffect, useMemo } from "react";
import { CircleCheck, ClipboardCheck, Layers, MessageSquareText, Package, Shapes } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { FilterInstance } from "@plane/shared-state";
import type { TFilterConfig, TReviewTailoringItem, TReviewTailoringProduct, TReviewTailoringRow } from "@plane/types";
import { EStageReviewKind } from "@plane/types";
import { createFilterConfig } from "@plane/utils";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import { createTailoringFiltersAdapter } from "../../list/rich-filters/adapter";
import type { TOperatorParams, TOption } from "../../list/rich-filters/use-tailoring-filters-config";
import { multiSelect } from "../../list/rich-filters/use-tailoring-filters-config";
import type { TDetailFilterExpression, TDetailFilterProperty } from "./types";
import {
  DETAIL_FILTER_PROPERTY_KEYS,
  DETAIL_REASON_FILLED,
  DETAIL_REASON_MISSING,
  DETAIL_RESULT_CUT,
  DETAIL_RESULT_KEEP,
} from "./types";

const I18N = "review_tailoring";

const detailFiltersAdapter = createTailoringFiltersAdapter(DETAIL_FILTER_PROPERTY_KEYS);

const KIND_ORDER: string[] = Object.values(EStageReviewKind);
const REVIEW_STATUS_ORDER = ["not_started", "in_review", "in_approval", "completed"];

/**
 * 裁剪表详情的筛选行实例：矩阵与明细共用一份条件，切 Tab 不丢。
 *
 * 条件不落本地存储 —— 每张表的阶段、产品各不相同，记下来换一张表多半对不上。
 * 选项来自这张表自己的行与列：阶段、类型只列表里出现过的，评审状态只在生成过评审后才有。
 */
export const useDetailFilter = ({
  workspaceSlug,
  tailoringId,
  rows,
  items,
  products,
}: {
  workspaceSlug: string;
  tailoringId: string;
  rows: TReviewTailoringRow[];
  items: TReviewTailoringItem[];
  products: TReviewTailoringProduct[];
}) => {
  const { t } = useTranslation();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  // 格子每改一下 items 就换引用；选项只跟阶段 / 类型 / 产品 / 是否生成过评审走，先压成键再建配置
  const stages = useMemo(() => {
    const byId = new Map<string, { label: string; sortOrder: number }>();
    const add = (id: string, label: string, sortOrder: number) => {
      if (!byId.has(id)) byId.set(id, { label, sortOrder });
    };
    for (const row of rows) add(row.stage_id, row.stage_label, row.stage_sort_order);
    // 挪到新阶段还没保存的格子也算：它在矩阵里已经是一行了
    for (const item of items) add(item.stage_id, item.stage_label, item.stage_sort_order);
    return [...byId.entries()]
      .sort(([, a], [, b]) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map(([id, stage]) => `${id}\u0000${stage.label}`)
      .join("\u0001");
  }, [rows, items]);
  const kinds = useMemo(
    () =>
      [...new Set(rows.map((row) => row.kind))]
        .sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b))
        .join(","),
    [rows]
  );
  const hasReviews = useMemo(() => items.some((item) => item.stage_review_id), [items]);

  const configs = useMemo<TFilterConfig<TDetailFilterProperty>[]>(() => {
    const params: TOperatorParams = {
      isEnabled: true,
      allowedOperators: operatorConfigs.allowedOperators,
      allowNegative: operatorConfigs.allowNegative,
    };
    const isLabel = t(`${I18N}.filters.operator_is`);
    const option = (value: string, label: string): TOption => ({ id: value, value, label });
    const stageOptions = stages
      ? stages.split("\u0001").map((entry) => {
          const [id, label] = entry.split("\u0000");
          return option(id, label);
        })
      : [];
    const kindOptions = kinds
      ? kinds.split(",").map((kind) => option(kind, t(`workspace_templates.reviews.kind.${kind}`)))
      : [];

    return [
      createFilterConfig<TDetailFilterProperty>({
        id: "stage",
        label: t(`${I18N}.matrix.stage_column`),
        icon: Layers,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(stageOptions, params, isLabel),
      }),
      createFilterConfig<TDetailFilterProperty>({
        id: "kind",
        label: t(`${I18N}.matrix.type_column`),
        icon: Shapes,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(kindOptions, params, isLabel),
      }),
      createFilterConfig<TDetailFilterProperty>({
        id: "product",
        label: t(`${I18N}.actions.add_axes_col_product`),
        icon: Package,
        isEnabled: true,
        // 与矩阵列头同一口径：写开发编号，产品名太长
        supportedOperatorConfigsMap: multiSelect(
          products.map((product) => option(product.id, product.identifier || product.name)),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TDetailFilterProperty>({
        id: "result",
        label: t(`${I18N}.matrix.result_column`),
        icon: CircleCheck,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [option(DETAIL_RESULT_KEEP, t(`${I18N}.matrix.keep`)), option(DETAIL_RESULT_CUT, t(`${I18N}.matrix.cut`))],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TDetailFilterProperty>({
        id: "reason",
        label: t(`${I18N}.matrix.reason`),
        icon: MessageSquareText,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [
            option(DETAIL_REASON_FILLED, t(`${I18N}.detail.filter_reason_filled`)),
            option(DETAIL_REASON_MISSING, t(`${I18N}.detail.filter_reason_missing`)),
          ],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TDetailFilterProperty>({
        id: "review_status",
        label: t(`${I18N}.matrix.review_status_column`),
        icon: ClipboardCheck,
        isEnabled: hasReviews,
        supportedOperatorConfigsMap: multiSelect(
          REVIEW_STATUS_ORDER.map((status) => option(status, t(`stage_review.status.${status}`))),
          params,
          isLabel
        ),
      }),
    ];
    // t 每次渲染都是新引用，放进依赖会让配置每帧重建、筛选行反复重注册；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, kinds, products, hasReviews, operatorConfigs.allowedOperators, operatorConfigs.allowNegative]);

  const clearLabel = t(`${I18N}.filters.clear_all`);
  const filter = useMemo(
    () =>
      new FilterInstance<TDetailFilterProperty, TDetailFilterExpression>({
        adapter: detailFiltersAdapter,
        initialExpression: {},
        options: {
          expression: {
            clearFilterOptions: { label: clearLabel, onFilterClear: () => undefined },
          },
        },
      }),
    // 实例只跟着表换；文案在建实例时取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tailoringId]
  );

  useEffect(() => {
    filter.configManager.registerAll(configs);
    filter.configManager.setAreConfigsReady(true);
  }, [configs, filter]);

  return filter;
};
