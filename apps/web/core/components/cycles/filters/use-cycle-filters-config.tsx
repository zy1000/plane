import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { CircleDot, Layers } from "lucide-react";
import { CYCLE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { DueDatePropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { TFilterConfig, TSupportedOperators } from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
} from "@plane/types";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getMultiSelectConfig,
  getStageFilterOptionLabel,
} from "@plane/utils";
import { DictionaryColorDot } from "@/components/data-dictionaries";
import { useProjectStage } from "@/hooks/store/use-project-stage";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TCycleFilterProperty } from "./types";
import { CYCLE_FILTER_NONE } from "./types";

const I18N = "project_cycles";

type TOption = { id: string; label: string; value: string; icon?: ReactNode };

type TOperatorParams = {
  isEnabled: boolean;
  allowedOperators: Set<TSupportedOperators>;
  allowNegative: boolean;
  /** createOperatorConfigEntry 回填，这里声明出来只是为了在回调里能类型安全地读 */
  isOperatorEnabled?: boolean;
};

/** 日期字段额外放行「早于 / 晚于」：CE 的 useFiltersOperatorConfigs 只给 exact / in / range */
const DATE_OPERATORS = new Set<TSupportedOperators>([
  EQUALITY_OPERATOR.EXACT,
  COMPARISON_OPERATOR.RANGE,
  EXTENDED_COMPARISON_OPERATOR.LT,
  EXTENDED_COMPARISON_OPERATOR.GT,
]);

const multiSelect = (options: TOption[], params: TOperatorParams, operatorLabel: string) =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updated) =>
      getMultiSelectConfig<TOption, string, TOption>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
          getIconData: (option) => option,
        },
        // 只选一个值时也按 IN 显示，否则会落到 map 里没有的 EXACT、标签变成英文 "is"
        { singleValueOperator: COLLECTION_OPERATOR.IN, isOperatorEnabled: updated.isOperatorEnabled, operatorLabel },
        { getOptionIcon: (option) => option.icon }
      )
    ),
  ]);

const dateOperators = (
  params: TOperatorParams,
  labels: { is: string; between: string; before: string; after: string }
) => {
  const dateParams: TOperatorParams = { ...params, allowedOperators: DATE_OPERATORS };
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, dateParams, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.is })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.LT, dateParams, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.before })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.GT, dateParams, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.after })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, dateParams, (updated) =>
      getDateRangePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.between })
    ),
  ]);
};

/**
 * 迭代列表筛选行可加的属性：状态 / 所属阶段 / 开始日期 / 结束日期（与原筛选面板一致）。
 *
 * - 状态选项带与列表一致的色点
 * - 阶段候选是项目阶段树先序（子阶段缩进），末尾「无阶段」给没挂阶段的迭代用
 */
export const useCycleFiltersConfig = ({ workspaceSlug, projectId }: { workspaceSlug: string; projectId: string }) => {
  const { t } = useTranslation();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });
  const { getProjectStageIds, getProjectStageOptions, fetchStages } = useProjectStage();

  // 阶段池通常已由 project-wrapper 预热；没拉过就补拉一次（同原筛选面板）
  const stageIds = getProjectStageIds(projectId);
  useEffect(() => {
    if (!stageIds) void fetchStages(workspaceSlug, projectId);
  }, [stageIds, workspaceSlug, projectId, fetchStages]);
  const stageOptions = getProjectStageOptions(projectId);

  return useMemo<TFilterConfig<TCycleFilterProperty>[]>(() => {
    const params: TOperatorParams = {
      isEnabled: true,
      allowedOperators: operatorConfigs.allowedOperators,
      allowNegative: operatorConfigs.allowNegative,
    };
    const isLabel = t(`${I18N}.filters.operator_is`);
    const dateLabels = {
      is: isLabel,
      between: t(`${I18N}.filters.operator_between`),
      before: t(`${I18N}.filters.operator_before`),
      after: t(`${I18N}.filters.operator_after`),
    };

    const statusOptions: TOption[] = CYCLE_STATUS.map((status) => ({
      id: status.value,
      value: status.value,
      label: t(status.i18n_title),
      icon: <DictionaryColorDot color={status.color} size="sm" />,
    }));

    const stageSelectOptions: TOption[] = [
      ...stageOptions.map((option) => ({
        id: option.stage.id,
        value: option.stage.id,
        label: getStageFilterOptionLabel(option),
      })),
      { id: CYCLE_FILTER_NONE, value: CYCLE_FILTER_NONE, label: t("stage_field.no_stage") },
    ];

    return [
      createFilterConfig<TCycleFilterProperty>({
        id: "status",
        label: t(`${I18N}.filters.status`),
        icon: CircleDot,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(statusOptions, params, isLabel),
      }),
      createFilterConfig<TCycleFilterProperty>({
        id: "stage",
        label: t(`${I18N}.filters.stage`),
        icon: Layers,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(stageSelectOptions, params, isLabel),
      }),
      createFilterConfig<TCycleFilterProperty>({
        id: "start_date",
        label: t(`${I18N}.start_date`),
        icon: StartDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
      createFilterConfig<TCycleFilterProperty>({
        id: "end_date",
        label: t(`${I18N}.end_date`),
        icon: DueDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
    ];
    // t 每次渲染都是新引用，放进依赖会让配置每帧重建、筛选行反复重注册；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageOptions, operatorConfigs.allowedOperators, operatorConfigs.allowNegative]);
};
