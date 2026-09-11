import { useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TStageReview } from "@plane/types";
import { EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { CustomSearchSelect, ToggleSwitch } from "@plane/ui";
import type { TStageReviewFilters } from "./stage-review-rows";

const I18N = "stage_review";
/** 「全部」不能用 null 当 value —— CustomSearchSelect 的清空语义会把它当没选 */
const ALL = "__all__";

/**
 * 筛选栏。筛选全在前端做：一个阶段的评审是几十条量级，服务端再筛一遍反而要把四张
 * 统计卡和分组头的计数单独再查一次。
 */
export const StageReviewFilters = ({
  reviews,
  filters,
  canManage,
  onChange,
  onCreate,
}: {
  reviews: TStageReview[];
  filters: TStageReviewFilters;
  canManage: boolean;
  onChange: (next: TStageReviewFilters) => void;
  onCreate: () => void;
}) => {
  const { t } = useTranslation();

  // 选项只来自当前阶段的数据：列出这个阶段根本没有的产品只会让人筛出空表
  const productOptions = useMemo(() => {
    const products = new Map<string, string>();
    for (const review of reviews) {
      if (review.product_detail) products.set(review.product_detail.id, review.product_detail.name);
    }
    return [...products.entries()].map(([id, name]) => ({ value: id, query: name, content: <span>{name}</span> }));
  }, [reviews]);

  const leaderOptions = useMemo(() => {
    const leaders = new Map<string, string>();
    for (const review of reviews) {
      if (review.leader_detail) leaders.set(review.leader_detail.id, review.leader_detail.display_name);
    }
    return [...leaders.entries()].map(([id, name]) => ({ value: id, query: name, content: <span>{name}</span> }));
  }, [reviews]);

  const allOption = { value: ALL, query: t(`${I18N}.filters.all`), content: <span>{t(`${I18N}.filters.all`)}</span> };

  const labelFor = (options: { value: string; query: string }[], value: string | null) =>
    options.find((option) => option.value === value)?.query ?? t(`${I18N}.filters.all`);

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-5 pt-4 pb-3">
      <CustomSearchSelect
        value={filters.productId ?? ALL}
        options={[allOption, ...productOptions]}
        onChange={(value: string) => onChange({ ...filters, productId: value === ALL ? null : value })}
        label={
          <span className="text-13 text-secondary">
            {t(`${I18N}.filters.product`)} <b className="font-medium text-primary">{labelFor(productOptions, filters.productId)}</b>
          </span>
        }
        maxHeight="lg"
      />
      <CustomSearchSelect
        value={filters.status ?? ALL}
        options={[
          allOption,
          ...STAGE_REVIEW_STATUS_ORDER.map((status) => ({
            value: status,
            query: t(`${I18N}.status.${status}`),
            content: <span>{t(`${I18N}.status.${status}`)}</span>,
          })),
        ]}
        onChange={(value: string) =>
          onChange({ ...filters, status: value === ALL ? null : (value as EStageReviewStatus) })
        }
        label={
          <span className="text-13 text-secondary">
            {t(`${I18N}.filters.status`)}{" "}
            <b className="font-medium text-primary">
              {filters.status ? t(`${I18N}.status.${filters.status}`) : t(`${I18N}.filters.all`)}
            </b>
          </span>
        }
        maxHeight="lg"
      />
      <CustomSearchSelect
        value={filters.leaderId ?? ALL}
        options={[allOption, ...leaderOptions]}
        onChange={(value: string) => onChange({ ...filters, leaderId: value === ALL ? null : value })}
        label={
          <span className="text-13 text-secondary">
            {t(`${I18N}.filters.leader`)} <b className="font-medium text-primary">{labelFor(leaderOptions, filters.leaderId)}</b>
          </span>
        }
        maxHeight="lg"
      />

      <label className="ml-1 flex items-center gap-2 text-13 text-secondary">
        <ToggleSwitch
          value={filters.mineOnly}
          onChange={(value) => onChange({ ...filters, mineOnly: value })}
          size="sm"
        />
        {t(`${I18N}.filters.mine_only`)}
      </label>

      <span className="flex-1" />

      {canManage && (
        <Button variant="neutral-primary" size="sm" onClick={onCreate}>
          {t(`${I18N}.actions.create`)}
        </Button>
      )}
    </div>
  );
};
