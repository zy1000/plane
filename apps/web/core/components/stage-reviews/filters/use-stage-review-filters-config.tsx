import type { ReactNode } from "react";
import { useMemo } from "react";
import { CircleDot, ClipboardCheck, Package, Type, UserCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { DueDatePropertyIcon, LayersIcon, MembersPropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TStageReview, TSupportedOperators } from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EStageReviewKind,
  EStageReviewResult,
  EXTENDED_EQUALITY_OPERATOR,
  STAGE_REVIEW_STATUS_ORDER,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getFileURL,
  getMultiSelectConfig,
  getTextInputConfig,
} from "@plane/utils";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import { StageReviewStatusIcon } from "../status-icon";
import type { TStageReviewFilterProperty } from "./types";
import { STAGE_REVIEW_FILTER_ME, STAGE_REVIEW_FILTER_NONE } from "./types";

const I18N = "stage_review";

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
 * 筛选行可加的属性。选项全部从**当前阶段的评审**里取：列出这个阶段根本没有的产品 /
 * 负责人只会让人筛出空表。负责人与审核者的第一项是「我」，最后一项是「未指定」。
 */
export const useStageReviewFiltersConfig = ({
  reviews,
  workspaceSlug,
  currentUser,
}: {
  reviews: TStageReview[];
  workspaceSlug: string;
  currentUser: IUserLite | undefined;
}) => {
  const { t } = useTranslation();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const configs = useMemo<TFilterConfig<TStageReviewFilterProperty>[]>(() => {
    const params: TOperatorParams = {
      isEnabled: true,
      allowedOperators: operatorConfigs.allowedOperators,
      allowNegative: operatorConfigs.allowNegative,
    };
    const isLabel = t(`${I18N}.filters.operator_is`);
    const dateLabels = { is: isLabel, between: t(`${I18N}.filters.operator_between`) };

    const people = (pick: (review: TStageReview) => IUserLite | null): TOption[] => {
      const map = new Map<string, TOption>();
      for (const review of reviews) {
        const user = pick(review);
        if (user && !map.has(user.id)) {
          map.set(user.id, { id: user.id, value: user.id, label: user.display_name, icon: avatar(user) });
        }
      }
      return [
        ...(currentUser
          ? [{ id: STAGE_REVIEW_FILTER_ME, value: STAGE_REVIEW_FILTER_ME, label: t(`${I18N}.list.me`), icon: avatar(currentUser) }]
          : []),
        ...[...map.values()].sort((a, b) => a.label.localeCompare(b.label)),
        { id: STAGE_REVIEW_FILTER_NONE, value: STAGE_REVIEW_FILTER_NONE, label: t(`${I18N}.list.unassigned`) },
      ];
    };

    const products = new Map<string, TOption>();
    for (const review of reviews) {
      if (review.product_detail && !products.has(review.product_id)) {
        products.set(review.product_id, {
          id: review.product_id,
          value: review.product_id,
          label: review.product_detail.name,
        });
      }
    }

    return [
      createFilterConfig<TStageReviewFilterProperty>({
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
      createFilterConfig<TStageReviewFilterProperty>({
        id: "status",
        label: t(`${I18N}.filters.status`),
        icon: CircleDot,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          STAGE_REVIEW_STATUS_ORDER.map((status) => ({
            id: status,
            value: status,
            label: t(`${I18N}.status.${status}`),
            icon: <StageReviewStatusIcon status={status} className="size-3.5" />,
          })),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TStageReviewFilterProperty>({
        id: "result",
        label: t(`${I18N}.filters.result`),
        icon: ClipboardCheck,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [
            ...Object.values(EStageReviewResult).map((result) => ({
              id: result,
              value: result,
              label: t(`${I18N}.result.${result}`),
            })),
            { id: STAGE_REVIEW_FILTER_NONE, value: STAGE_REVIEW_FILTER_NONE, label: t(`${I18N}.list.no_result`) },
          ],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TStageReviewFilterProperty>({
        id: "leader_id",
        label: t(`${I18N}.filters.leader`),
        icon: MembersPropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(people((review) => review.leader_detail), params, isLabel),
      }),
      createFilterConfig<TStageReviewFilterProperty>({
        id: "auditor_id",
        label: t(`${I18N}.filters.auditor`),
        icon: UserCheck,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(people((review) => review.auditor_detail), params, isLabel),
      }),
      createFilterConfig<TStageReviewFilterProperty>({
        id: "product_id",
        label: t(`${I18N}.filters.product`),
        icon: Package,
        isEnabled: products.size > 0,
        supportedOperatorConfigsMap: multiSelect([...products.values()], { ...params, isEnabled: products.size > 0 }, isLabel),
      }),
      createFilterConfig<TStageReviewFilterProperty>({
        id: "kind",
        label: t(`${I18N}.filters.kind`),
        icon: LayersIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          Object.values(EStageReviewKind).map((kind) => ({
            id: kind,
            value: kind,
            label: t(`workspace_templates.reviews.kind.${kind}`),
          })),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TStageReviewFilterProperty>({
        id: "start_date",
        label: t(`${I18N}.filters.start_date`),
        icon: StartDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
      createFilterConfig<TStageReviewFilterProperty>({
        id: "end_date",
        label: t(`${I18N}.filters.end_date`),
        icon: DueDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
    ];
    // t 每次渲染都是新引用，放进依赖会让配置每帧重建、筛选行反复重注册；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, currentUser, operatorConfigs.allowedOperators, operatorConfigs.allowNegative]);

  return { areAllConfigsInitialized: true, configs };
};
