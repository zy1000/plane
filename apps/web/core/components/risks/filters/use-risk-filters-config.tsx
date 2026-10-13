import type { ReactNode } from "react";
import { useMemo } from "react";
import { CircleDot, Gauge, Percent, Route, ShieldAlert, Tag, UserRound } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { DueDatePropertyIcon, MembersPropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TSupportedOperators } from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  RISK_CATEGORIES,
  RISK_LEVELS,
  RISK_SCALES,
  RISK_STATUSES,
  RISK_STRATEGIES,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  cn,
  createFilterConfig,
  createOperatorConfigEntry,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getFileURL,
  getMultiSelectConfig,
} from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TRiskScaleField } from "../constants";
import {
  getRiskScaleLabel,
  RISK_I18N,
  RISK_LEVEL_STYLE,
  RISK_STATUS_STYLE,
  riskCategoryLabelKey,
  riskLevelLabelKey,
  riskStatusLabelKey,
  riskStrategyLabelKey,
} from "../constants";
import type { TRiskFilterProperty } from "./types";
import { RISK_FILTER_ME, RISK_FILTER_NONE } from "./types";

type TOption = { id: string; label: string; value: string; icon?: ReactNode };

/**
 * `createOperatorConfigEntry` 运行时会把 `isOperatorEnabled` 注入回调参数，但它的类型签名只是传入的
 * 参数类型本身，所以这里把它声明成可选项，读的时候再按 boolean 收口。
 */
type TOperatorParams = {
  isEnabled: boolean;
  allowedOperators: Set<TSupportedOperators>;
  allowNegative: boolean;
  isOperatorEnabled?: boolean;
};

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
        { singleValueOperator: EQUALITY_OPERATOR.EXACT, isOperatorEnabled: Boolean(updated.isOperatorEnabled), operatorLabel },
        { getOptionIcon: (option) => option.icon }
      )
    ),
  ]);

const dateOperators = (params: TOperatorParams, labels: { is: string; between: string }) =>
  new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: Boolean(updated.isOperatorEnabled), operatorLabel: labels.is })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, params, (updated) =>
      getDateRangePickerConfig({ isOperatorEnabled: Boolean(updated.isOperatorEnabled), operatorLabel: labels.between })
    ),
  ]);

const avatar = (user: Pick<IUserLite, "display_name" | "avatar_url">) => (
  <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} size="sm" />
);

/**
 * 筛选行可加的属性，10 个：状态 / 类别 / 等级 / 影响程度 / 发生概率 / 策略 / 责任人 / 提出人 / 提出时间 / 计划处理。
 * 枚举项的选项固定，人员选项从项目成员表取（第一项是「我」，最后一项是「未指定」）。
 *
 * 成员表是异步进 store 的 observable，调用方（列表组件）本身是 observer，成员到了会重算一次。
 */
export const useRiskFiltersConfig = ({
  workspaceSlug,
  projectId,
  currentUser,
}: {
  workspaceSlug: string;
  projectId: string;
  currentUser: IUserLite | undefined;
}) => {
  const { t } = useTranslation();
  const { getUserDetails, project: projectMemberStore } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });
  const memberIds = projectMemberStore.getProjectMemberIds(projectId, false) ?? [];
  // 成员详情是 observable，拼成一个稳定的 key 让 useMemo 能感知到人员变化
  const memberKey = memberIds.map((id) => `${id}:${getUserDetails(id)?.display_name ?? ""}`).join("|");

  const configs = useMemo<TFilterConfig<TRiskFilterProperty>[]>(() => {
    const params: TOperatorParams = {
      isEnabled: true,
      allowedOperators: operatorConfigs.allowedOperators,
      allowNegative: operatorConfigs.allowNegative,
    };
    const isLabel = t(`${RISK_I18N}.filters.operator_is`);
    const dateLabels = { is: isLabel, between: t(`${RISK_I18N}.filters.operator_between`) };
    const noneOption: TOption = { id: RISK_FILTER_NONE, value: RISK_FILTER_NONE, label: t(`${RISK_I18N}.filters.none`) };

    const people: TOption[] = [
      ...(currentUser
        ? [{ id: RISK_FILTER_ME, value: RISK_FILTER_ME, label: t(`${RISK_I18N}.filters.me`), icon: avatar(currentUser) }]
        : []),
      ...memberIds
        .map((id) => getUserDetails(id))
        .filter((user): user is IUserLite => Boolean(user))
        .map((user) => ({ id: user.id, value: user.id, label: user.display_name, icon: avatar(user) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      noneOption,
    ];

    const scaleOptions = (field: TRiskScaleField): TOption[] =>
      RISK_SCALES.map((scale) => ({
        id: String(scale),
        value: String(scale),
        label: getRiskScaleLabel(t, field, scale),
      }));

    return [
      createFilterConfig<TRiskFilterProperty>({
        id: "status",
        label: t(`${RISK_I18N}.filters.status`),
        icon: CircleDot,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          RISK_STATUSES.map((status) => ({
            id: status,
            value: status,
            label: t(riskStatusLabelKey(status)),
            icon: <span className={cn("size-2 rounded-full", RISK_STATUS_STYLE[status].dot)} />,
          })),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "category",
        label: t(`${RISK_I18N}.filters.category`),
        icon: Tag,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [
            ...RISK_CATEGORIES.map((category) => ({
              id: category,
              value: category,
              label: t(riskCategoryLabelKey(category)),
            })),
            noneOption,
          ],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "risk_level",
        label: t(`${RISK_I18N}.filters.level`),
        icon: ShieldAlert,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          RISK_LEVELS.map((level) => ({
            id: level,
            value: level,
            label: t(riskLevelLabelKey(level)),
            icon: <span className={cn("size-2 rounded-[2px]", RISK_LEVEL_STYLE[level].square)} />,
          })),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "impact_level",
        label: t(`${RISK_I18N}.filters.impact_level`),
        icon: Gauge,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(scaleOptions("impact_level"), params, isLabel),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "probability",
        label: t(`${RISK_I18N}.filters.probability`),
        icon: Percent,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(scaleOptions("probability"), params, isLabel),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "strategy",
        label: t(`${RISK_I18N}.filters.strategy`),
        icon: Route,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [
            ...RISK_STRATEGIES.map((strategy) => ({
              id: strategy,
              value: strategy,
              label: t(riskStrategyLabelKey(strategy)),
            })),
            noneOption,
          ],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "owner_id",
        label: t(`${RISK_I18N}.filters.owner`),
        icon: MembersPropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(people, params, isLabel),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "proposer_id",
        label: t(`${RISK_I18N}.filters.proposer`),
        icon: UserRound,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(people, params, isLabel),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "proposed_date",
        label: t(`${RISK_I18N}.filters.proposed_date`),
        icon: StartDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
      createFilterConfig<TRiskFilterProperty>({
        id: "planned_handle_date",
        label: t(`${RISK_I18N}.filters.planned_handle_date`),
        icon: DueDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
    ];
    // t 每次渲染都是新引用，放进依赖会让配置每帧重建、筛选行反复重注册；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey, currentUser, operatorConfigs.allowedOperators, operatorConfigs.allowNegative]);

  return configs;
};
