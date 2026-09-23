import type { ReactNode } from "react";
import { useMemo } from "react";
import { CircleDot, Scissors, Type } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CalendarLayoutIcon, MembersPropertyIcon } from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TReviewTailoring, TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, COMPARISON_OPERATOR, EQUALITY_OPERATOR, EXTENDED_EQUALITY_OPERATOR } from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  cn,
  createFilterConfig,
  createOperatorConfigEntry,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getFileURL,
  getMultiSelectConfig,
  getTextInputConfig,
} from "@plane/utils";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import { TAILORING_KIND_ORDER, TAILORING_STATUS_ORDER, TAILORING_STATUS_TONE } from "../filters";
import type { TTailoringFilterProperty } from "./types";
import { TAILORING_FILTER_ME } from "./types";

const I18N = "review_tailoring";

type TOption = { id: string; label: string; value: string; icon?: ReactNode };

type TOperatorParams = { isEnabled: boolean; allowedOperators: Set<TSupportedOperators>; allowNegative: boolean };

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
        { singleValueOperator: EQUALITY_OPERATOR.EXACT, isOperatorEnabled: updated.isOperatorEnabled, operatorLabel },
        { getOptionIcon: (option) => option.icon }
      )
    ),
  ]);

const dateOperators = (params: TOperatorParams, labels: { is: string; between: string }) =>
  new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.is })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, params, (updated) =>
      getDateRangePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.between })
    ),
  ]);

const avatar = (user: Pick<IUserLite, "display_name" | "avatar_url">) => (
  <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} size="sm" />
);

/**
 * 筛选行可加的属性：标题 / 状态 / 创建人 / 创建日期 / 更新日期。
 * 创建人选项只来自列表本身（列出没建过表的成员只会筛出空表），第一项是「我」。
 */
export const useTailoringFiltersConfig = ({
  tailorings,
  workspaceSlug,
  currentUser,
}: {
  tailorings: TReviewTailoring[];
  workspaceSlug: string;
  currentUser: IUserLite | undefined;
}) => {
  const { t } = useTranslation();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  return useMemo<TFilterConfig<TTailoringFilterProperty>[]>(() => {
    const params: TOperatorParams = {
      isEnabled: true,
      allowedOperators: operatorConfigs.allowedOperators,
      allowNegative: operatorConfigs.allowNegative,
    };
    const isLabel = t(`${I18N}.filters.operator_is`);
    const dateLabels = { is: isLabel, between: t(`${I18N}.filters.operator_between`) };

    const creators = new Map<string, TOption>();
    for (const item of tailorings) {
      const user = item.created_by_detail;
      if (user && !creators.has(user.id)) {
        creators.set(user.id, { id: user.id, value: user.id, label: user.display_name, icon: avatar(user) });
      }
    }

    return [
      createFilterConfig<TTailoringFilterProperty>({
        id: "title",
        label: t(`${I18N}.filters.title`),
        icon: Type,
        isEnabled: true,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.CONTAINS, params, (updated) =>
            getTextInputConfig({
              isOperatorEnabled: updated.isOperatorEnabled,
              operatorLabel: t(`${I18N}.filters.operator_contains`),
            })
          ),
        ]),
      }),
      createFilterConfig<TTailoringFilterProperty>({
        id: "status",
        label: t(`${I18N}.filters.status`),
        icon: CircleDot,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          TAILORING_STATUS_ORDER.map((status) => ({
            id: status,
            value: status,
            label: t(`${I18N}.status.${status}`),
            icon: <span className={cn("inline-block size-2 rounded-full bg-current", TAILORING_STATUS_TONE[status])} />,
          })),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TTailoringFilterProperty>({
        id: "tailoring_kind",
        label: t(`${I18N}.filters.tailoring_kind`),
        icon: Scissors,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          TAILORING_KIND_ORDER.map((kind) => ({ id: kind, value: kind, label: t(`${I18N}.kind.${kind}`) })),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TTailoringFilterProperty>({
        id: "created_by",
        label: t(`${I18N}.filters.created_by`),
        icon: MembersPropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [
            ...(currentUser
              ? [{ id: TAILORING_FILTER_ME, value: TAILORING_FILTER_ME, label: t(`${I18N}.filters.me`), icon: avatar(currentUser) }]
              : []),
            ...[...creators.values()].sort((a, b) => a.label.localeCompare(b.label)),
          ],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TTailoringFilterProperty>({
        id: "created_at",
        label: t(`${I18N}.filters.created_at`),
        icon: CalendarLayoutIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
      createFilterConfig<TTailoringFilterProperty>({
        id: "updated_at",
        label: t(`${I18N}.filters.updated_at`),
        icon: CalendarLayoutIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
    ];
    // t 每次渲染都是新引用，放进依赖会让配置每帧重建、筛选行反复重注册；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tailorings, currentUser, operatorConfigs.allowedOperators, operatorConfigs.allowNegative]);
};
