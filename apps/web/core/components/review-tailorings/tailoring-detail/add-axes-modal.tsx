import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Boxes, ClipboardCheck, ListChecks, Package, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TAddReviewTailoringAxesPayload,
  TReviewTailoringAxisOption,
  TReviewTailoringProduct,
  TReviewTailoringRow,
} from "@plane/types";
import { type EReviewTailoringKind, type EStageReviewKind, STAGE_REVIEW_ROOT_KINDS } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useTailoringAxisOptions } from "@/hooks/store/use-tailoring-axis-options";
import { ModalSearch, TailoringModalHeader } from "./modal-header";
import { StageFilterChip } from "./stage-filter-chip";
import { splitChildTitle } from "./tailoring-matrix-model";

const I18N = "review_tailoring.actions";

/** 左栏行：评审与活动都是一行，四列对齐 —— 复选框 / 阶段 / 标题 / 锁定标签 */
const REVIEW_COLS = "grid grid-cols-[1rem_4.75rem_1fr_auto] items-center gap-x-2.5 px-4";
/** 右栏行：复选框 / 图标 / 名称 / 锁定标签 */
const PRODUCT_COLS = "grid grid-cols-[1rem_1.5rem_1fr_auto] items-center gap-x-3 px-4";

type TBlocked = "in_matrix" | null;

/**
 * 平铺后的一行：模式阶段 × 节点，评审和评审活动平级。
 *
 * **勾选的单位是节点（``templateId``）而不是这一行**：纵轴按节点存，加一个节点等于在模式
 * 勾过它的每个阶段下都加一行。所以同一个节点的几行会一起亮起来，行上标了它横跨几个阶段。
 */
type TFlatRow = {
  templateId: string;
  /** 已在矩阵里：列出来但不能勾。停用节点服务端已经滤掉了 */
  blocked: TBlocked;
  stageId: string;
  stageLabel: string;
  isReview: boolean;
  /** 活动行所属评审的标题；评审行为 null */
  parentTitle: string | null;
  /** 去掉父评审前缀后的标题，前缀由 parentTitle 那段淡色承担 */
  title: string;
};

type TStageChoice = { id: string; label: string; available: number; allInMatrix: boolean };

/** 栏头：图标 + 「评审」/「产品」 + 已选几个 */
const PaneHeader = ({ icon, label, count }: { icon: ReactNode; label: string; count: number }) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-10.5 shrink-0 items-center gap-2 border-b border-subtle px-4 text-13 font-semibold text-primary">
      <span className="flex text-tertiary">{icon}</span>
      {label}
      <span
        className={cn(
          "ml-auto rounded-full px-2 text-11 leading-5 font-medium tabular-nums",
          count > 0 ? "bg-accent-subtle text-accent-primary" : "bg-layer-3 text-placeholder"
        )}
      >
        {t(`${I18N}.add_axes_picked`, { count })}
      </span>
    </div>
  );
};

const LockedTag = ({ label }: { label: string }) => (
  <span className="shrink-0 rounded border border-subtle px-1.5 text-11 text-placeholder">{label}</span>
);

/**
 * 清单列头：三态复选框 + 列名 + 全选 / 取消全选。
 * 三个入口作用范围一致 —— 只动当前筛选、搜索下可勾的行，已在表中和已停用的一概不碰。
 */
const ListHeader = ({
  columns,
  labels,
  pickedCount,
  selectableCount,
  onSelectAll,
  onClearAll,
}: {
  columns: string;
  labels: ReactNode;
  pickedCount: number;
  selectableCount: number;
  onSelectAll: () => void;
  onClearAll: () => void;
}) => {
  const { t } = useTranslation();
  const isAll = selectableCount > 0 && pickedCount === selectableCount;
  return (
    <div
      className={cn(
        columns,
        "h-8.5 shrink-0 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary"
      )}
    >
      <Checkbox
        checked={isAll}
        indeterminate={pickedCount > 0 && !isAll}
        disabled={selectableCount === 0}
        onChange={() => (isAll ? onClearAll() : onSelectAll())}
      />
      {labels}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          disabled={isAll || selectableCount === 0}
          className="text-accent-primary hover:underline disabled:text-placeholder disabled:no-underline"
          onClick={onSelectAll}
        >
          {t(`${I18N}.add_axes_select_all`)}
        </button>
        <span className="h-3 w-px bg-(--border-strong)" />
        <button
          type="button"
          disabled={pickedCount === 0}
          className="text-accent-primary hover:underline disabled:text-placeholder disabled:no-underline"
          onClick={onClearAll}
        >
          {t(`${I18N}.add_axes_clear_all`)}
        </button>
      </div>
    </div>
  );
};

/**
 * 给裁剪表一次加评审（纵轴）和产品（横轴）。左右两栏各自搜索、各自勾选，只勾一边也能提交。
 *
 * 左栏是一张**平铺清单**：不按阶段折叠，每行一个评审或一个评审活动，阶段单独成列，
 * 活动行前面淡写所属评审，所以不分组也看得出归属。阶段筛选与搜索叠加生效。
 * 评审与评审活动**各自独立**：只加评审、只加活动、两者都加都行，勾谁都不会带动另一方。
 * 已在表里的、模板已停用的都列出来但锁住 —— 比直接藏掉更不容易让人以为「库里没有这条」。
 * 底部实时算这次会新增多少行、多少格。
 */
export const AddAxesModal = observer(function AddAxesModal({
  isOpen,
  isSubmitting,
  workspaceSlug,
  projectId,
  tailoringId,
  tailoringKind,
  existingRows,
  existingProducts,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string;
  projectId: string;
  tailoringId: string;
  /** 候选已由服务端按类型挑过族；这里只用来让空态说清「本类型没有可加的节点」 */
  tailoringKind: EReviewTailoringKind;
  existingRows: TReviewTailoringRow[];
  existingProducts: TReviewTailoringProduct[];
  onClose: () => void;
  onSubmit: (payload: TAddReviewTailoringAxesPayload) => void;
}) {
  const { t } = useTranslation();

  const { options, isLoading: isLoadingReviews } = useTailoringAxisOptions(
    workspaceSlug,
    projectId,
    tailoringId,
    isOpen
  );
  const { links, isLoading: isLoadingProducts } = useProjectProducts({ workspaceSlug, projectId });

  /** 勾中的模板节点 id：评审与活动平等，提交时原样发出去 */
  const [reviewIds, setReviewIds] = useState<Set<string>>(new Set());
  const [productIds, setProductIds] = useState<string[]>([]);
  const [reviewQuery, setReviewQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  /** null = 全部阶段 */
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReviewIds(new Set());
    setProductIds([]);
    setReviewQuery("");
    setProductQuery("");
    setStageFilter(null);
  }, [isOpen]);

  // ---- 评审候选：服务端已经按「模式阶段 × 节点」铺平，这里只补父评审标题 ----
  const rows = useMemo<TFlatRow[]>(() => {
    // 父评审标题按 (阶段, 节点) 找：同一个活动在两个阶段下的父是各自那个阶段的评审
    const titleByKey = new Map<string, string>();
    for (const option of options) titleByKey.set(`${option.stage_id}:${option.template_id}`, option.title);
    return options.map((option: TReviewTailoringAxisOption) => {
      const parentTitle = option.parent_template_id
        ? (titleByKey.get(`${option.stage_id}:${option.parent_template_id}`) ?? null)
        : null;
      return {
        templateId: option.template_id,
        blocked: option.in_matrix ? "in_matrix" : null,
        stageId: option.stage_id,
        stageLabel: option.stage_label,
        isReview: STAGE_REVIEW_ROOT_KINDS.includes(option.kind as EStageReviewKind),
        parentTitle,
        title: parentTitle ? splitChildTitle(parentTitle, option.title).rest : option.title,
      };
    });
  }, [options]);

  /** 每个节点横跨几个模式阶段 —— 勾一下会加几行，底部算账与行上的标记都要用 */
  const stagesPerTemplate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.templateId, (counts.get(row.templateId) ?? 0) + 1);
    return counts;
  }, [rows]);

  /** 筛选下拉的阶段清单与各自可加条数；不跟搜索词走，免得计数一边打字一边跳 */
  const stageChoices = useMemo<TStageChoice[]>(() => {
    const order: string[] = [];
    const buckets = new Map<string, TFlatRow[]>();
    for (const row of rows) {
      const bucket = buckets.get(row.stageId);
      if (bucket) bucket.push(row);
      else {
        order.push(row.stageId);
        buckets.set(row.stageId, [row]);
      }
    }
    return order.map((stageId) => {
      const bucket = buckets.get(stageId) ?? [];
      return {
        id: stageId,
        label: bucket[0].stageLabel,
        available: bucket.filter((row) => !row.blocked).length,
        allInMatrix: bucket.every((row) => row.blocked === "in_matrix"),
      };
    });
  }, [rows]);

  const reviewKeyword = reviewQuery.trim().toLowerCase();
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (stageFilter && row.stageId !== stageFilter) return false;
        if (!reviewKeyword) return true;
        // 搜父评审名也带出它下面的活动，跟分组时代「搜到评审 = 看到整组」的手感一致
        return (
          row.title.toLowerCase().includes(reviewKeyword) ||
          (row.parentTitle ?? "").toLowerCase().includes(reviewKeyword)
        );
      }),
    [rows, stageFilter, reviewKeyword]
  );

  // ---- 产品候选 ----
  const takenProducts = useMemo(() => new Set(existingProducts.map((product) => product.id)), [existingProducts]);
  const productKeyword = productQuery.trim().toLowerCase();
  const visibleLinks = productKeyword
    ? links.filter(
        (link) =>
          link.product_name.toLowerCase().includes(productKeyword) ||
          (link.product_code ?? "").toLowerCase().includes(productKeyword)
      )
    : links;

  const toggleReview = (id: string) =>
    setReviewIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleProduct = (id: string) =>
    setProductIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  // ---- 全选 / 取消全选：只作用于当前可见且可勾的行 ----
  const selectableReviewIds = useMemo(
    () => visibleRows.filter((row) => !row.blocked).map((row) => row.templateId),
    [visibleRows]
  );
  const pickedVisibleReviews = selectableReviewIds.filter((id) => reviewIds.has(id)).length;
  const selectAllReviews = () => setReviewIds((current) => new Set([...current, ...selectableReviewIds]));
  const clearAllReviews = () =>
    setReviewIds((current) => {
      const next = new Set(current);
      for (const id of selectableReviewIds) next.delete(id);
      return next;
    });

  const selectableProductIds = useMemo(
    () => visibleLinks.filter((link) => !takenProducts.has(link.product)).map((link) => link.product),
    [visibleLinks, takenProducts]
  );
  const pickedVisibleProducts = selectableProductIds.filter((id) => productIds.includes(id)).length;
  const selectAllProducts = () => setProductIds((current) => [...new Set([...current, ...selectableProductIds])]);
  const clearAllProducts = () =>
    setProductIds((current) => current.filter((id) => !selectableProductIds.includes(id)));

  // ---- 底部算账 ----
  // 勾选以节点为单位，但加进表里的是**行** —— 一个节点在模式里被两个阶段勾过就是两行
  const pickedTemplates = useMemo(() => {
    const seen = new Map<string, boolean>();
    for (const row of rows) if (reviewIds.has(row.templateId)) seen.set(row.templateId, row.isReview);
    return seen;
  }, [rows, reviewIds]);
  const reviews = [...pickedTemplates.values()].filter(Boolean).length;
  const activities = pickedTemplates.size - reviews;
  const rowCount = [...pickedTemplates.keys()].reduce(
    (total, templateId) => total + (stagesPerTemplate.get(templateId) ?? 1),
    0
  );
  const products = productIds.length;
  // 新行 × 全部列（旧列 + 新列）+ 旧行 × 新列
  const cells = rowCount * (existingProducts.length + products) + existingRows.length * products;
  const summary =
    rowCount > 0 && products > 0
      ? t(`${I18N}.add_axes_summary`, { reviews, activities, rows: rowCount, products, cells })
      : rowCount > 0
        ? t(`${I18N}.add_axes_summary_reviews`, { reviews, activities, rows: rowCount, cells })
        : products > 0
          ? t(`${I18N}.add_axes_summary_products`, { products, cells })
          : null;
  const applyLabel =
    rowCount > 0 && products > 0
      ? t(`${I18N}.add_axes_apply`, { rows: rowCount, products })
      : products > 0
        ? t(`${I18N}.add_axes_apply_products`, { products })
        : rowCount > 0
          ? t(`${I18N}.add_axes_apply_reviews`, { rows: rowCount })
          : t("review_tailoring.detail.add_axes");

  const blockedLabel = (_blocked: Exclude<TBlocked, null>) => t(`${I18N}.add_reviews_in_matrix`);

  const stageOptions = stageChoices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    dim: choice.available === 0,
    hint:
      choice.available > 0
        ? t(`${I18N}.add_axes_stage_count`, { count: choice.available })
        : choice.allInMatrix
          ? t(`${I18N}.add_axes_stage_in_matrix`)
          : t(`${I18N}.add_axes_stage_none`),
  }));

  const renderRow = (row: TFlatRow) => {
    const { templateId, blocked, parentTitle } = row;
    const isPicked = reviewIds.has(templateId);
    // 同一个节点横跨几个阶段时，勾一下几行一起进表 —— 在行上说清楚，别让人以为只加这一行
    const spanned = stagesPerTemplate.get(templateId) ?? 1;
    return (
      <label
        key={`${row.stageId}:${templateId}`}
        className={cn(
          REVIEW_COLS,
          "h-10 border-b border-subtle text-13",
          blocked ? "text-placeholder" : "cursor-pointer text-primary hover:bg-layer-transparent-hover",
          isPicked && "bg-accent-subtle/60"
        )}
      >
        <Checkbox
          checked={isPicked || blocked === "in_matrix"}
          disabled={Boolean(blocked)}
          onChange={() => toggleReview(templateId)}
        />
        <span
          className={cn("flex min-w-0 items-center gap-1.5 text-12.5", blocked ? "text-placeholder" : "text-secondary")}
          title={row.stageLabel}
        >
          <span className="truncate">{row.stageLabel}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2" title={row.title}>
          {row.isReview && <ClipboardCheck className="size-3.5 shrink-0 text-tertiary" />}
          {/* 前缀不截断：截一半就认不出是哪个评审了，让活动名去 truncate（悬停看全名） */}
          {parentTitle && <span className="shrink-0 text-placeholder">{parentTitle} ›</span>}
          <span className={cn("min-w-0 truncate", row.isReview && "font-medium")}>{row.title}</span>
          {spanned > 1 && (
            <span className="shrink-0 rounded bg-layer-3 px-1.5 text-11 leading-4 text-tertiary">
              {t(`${I18N}.add_axes_multi_stage`, { stages: spanned })}
            </span>
          )}
        </span>
        {blocked && <LockedTag label={blockedLabel(blocked)} />}
      </label>
    );
  };

  const listLoader = (
    <Loader className="space-y-2 p-4">
      <Loader.Item height="36px" />
      <Loader.Item height="36px" />
      <Loader.Item height="36px" />
    </Loader>
  );

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <TailoringModalHeader icon={<Plus className="size-5" />} title={t(`${I18N}.add_axes_title`)} onClose={onClose} />

      <div className="grid h-[min(32rem,65vh)] grid-cols-2 divide-x divide-subtle border-y border-subtle">
        {/* 左：评审 */}
        <section className="flex min-h-0 flex-col">
          <PaneHeader icon={<ListChecks className="size-4" />} label={t(`${I18N}.add_axes_reviews`)} count={rowCount} />
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle pr-3">
            <ModalSearch
              id="review-tailoring-add-axes-reviews-search"
              value={reviewQuery}
              placeholder={t(`${I18N}.add_reviews_search`)}
              onChange={setReviewQuery}
              className="h-full flex-1 border-b-0"
            />
            <StageFilterChip
              label={t(`${I18N}.add_axes_stage_filter`)}
              allLabel={t(`${I18N}.add_axes_stage_all`)}
              value={stageFilter}
              options={stageOptions}
              allHint={String(rows.filter((row) => !row.blocked).length)}
              onChange={setStageFilter}
            />
          </div>
          <ListHeader
            columns={REVIEW_COLS}
            labels={
              <>
                <span>{t(`${I18N}.add_axes_col_stage`)}</span>
                <span>{t(`${I18N}.add_axes_col_review`)}</span>
              </>
            }
            pickedCount={pickedVisibleReviews}
            selectableCount={selectableReviewIds.length}
            onSelectAll={selectAllReviews}
            onClearAll={clearAllReviews}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoadingReviews ? (
              listLoader
            ) : rows.length === 0 ? (
              <p className="px-4 py-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_empty_${tailoringKind}`)}</p>
            ) : visibleRows.length === 0 ? (
              <p className="px-4 py-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_no_match`)}</p>
            ) : (
              visibleRows.map(renderRow)
            )}
          </div>
        </section>

        {/* 右：产品 */}
        <section className="flex min-h-0 flex-col">
          <PaneHeader icon={<Boxes className="size-4" />} label={t(`${I18N}.add_axes_products`)} count={products} />
          <ModalSearch
            id="review-tailoring-add-axes-products-search"
            value={productQuery}
            placeholder={t(`${I18N}.add_products_search`)}
            onChange={setProductQuery}
            className="h-11"
          />
          <ListHeader
            columns={PRODUCT_COLS}
            labels={
              <>
                <span />
                <span>{t(`${I18N}.add_axes_col_product`)}</span>
              </>
            }
            pickedCount={pickedVisibleProducts}
            selectableCount={selectableProductIds.length}
            onSelectAll={selectAllProducts}
            onClearAll={clearAllProducts}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoadingProducts ? (
              listLoader
            ) : links.length === 0 ? (
              <p className="px-4 py-6 text-13 text-tertiary">{t(`${I18N}.add_products_empty`)}</p>
            ) : visibleLinks.length === 0 ? (
              <p className="px-4 py-6 text-13 text-tertiary">{t(`${I18N}.add_products_no_match`)}</p>
            ) : (
              visibleLinks.map((link) => {
                const inMatrix = takenProducts.has(link.product);
                const isPicked = productIds.includes(link.product);
                return (
                  <label
                    key={link.product}
                    className={cn(
                      PRODUCT_COLS,
                      "h-10 border-b border-subtle text-13",
                      inMatrix ? "text-placeholder" : "cursor-pointer text-primary hover:bg-layer-transparent-hover",
                      isPicked && "bg-accent-subtle/60"
                    )}
                  >
                    <Checkbox
                      checked={isPicked || inMatrix}
                      disabled={inMatrix}
                      onChange={() => toggleProduct(link.product)}
                    />
                    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-layer-3 text-tertiary">
                      <Package className="size-3.5" />
                    </span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="truncate">{link.product_name}</span>
                      {link.product_code && (
                        <span className="shrink-0 text-12 text-placeholder tabular-nums">{link.product_code}</span>
                      )}
                    </span>
                    {inMatrix && <LockedTag label={t(`${I18N}.add_products_in_matrix`)} />}
                  </label>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
        <span className="min-w-0 flex-1 text-13 text-tertiary tabular-nums">{summary}</span>
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={(rowCount === 0 && products === 0) || isSubmitting}
          onClick={() => onSubmit({ template_ids: [...reviewIds], product_ids: productIds })}
        >
          {applyLabel}
        </Button>
      </div>
    </ModalCore>
  );
});
