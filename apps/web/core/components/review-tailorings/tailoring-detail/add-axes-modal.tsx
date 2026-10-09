import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
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
import { PLAIN_TD, PLAIN_TH } from "../plain-table";
import { ModalSearch, TailoringModalFooter, TailoringModalHeader } from "./modal-frame";
import { StageFilterChip } from "./stage-filter-chip";
import { splitChildTitle } from "./tailoring-matrix-model";

const I18N = "review_tailoring.actions";

/** 左栏：勾选 / 阶段 / 评审或评审活动 / 类型 / 状态 */
const REVIEW_COLS = "grid grid-cols-[2.75rem_7rem_minmax(0,1fr)_6.5rem_5rem] items-center";
/** 右栏：勾选 / 产品 / 状态 */
const PRODUCT_COLS = "grid grid-cols-[2.75rem_minmax(0,1fr)_5rem] items-center";

const HEAD_CELL = cn(PLAIN_TH, "flex h-9.5 items-center border-r-0");
const BODY_CELL = cn(PLAIN_TD, "flex h-10 min-w-0 items-center border-r-0");

type TBlocked = "in_matrix" | null;

/**
 * 平铺后的一行：项目阶段 × 节点，评审和评审活动平级。
 *
 * **勾选的单位是节点（``templateId``）而不是这一行**：纵轴按节点存，加一个节点等于在本项目
 * 每个能选它的阶段（父子皆有）下都加一行。所以同一个节点的几行会一起亮起来，行上标了它横跨几个阶段。
 */
type TFlatRow = {
  templateId: string;
  /** 已在矩阵里：列出来但不能勾。停用节点服务端已经滤掉了 */
  blocked: TBlocked;
  stageId: string;
  stageLabel: string;
  stageDepth: number;
  isReview: boolean;
  kind: string;
  /** 模板节点的标准编号，画在名称前、竖向对齐，也能按它搜 */
  standardCode: string;
  /** 活动行所属评审的标题；评审行为 null */
  parentTitle: string | null;
  /** 去掉父评审前缀后的标题，前缀由 parentTitle 那段淡色承担 */
  title: string;
};

type TStageChoice = { id: string; label: string; depth: number; available: number; allInMatrix: boolean };

/** 栏头：「评审」/「产品」+ 右侧的搜索与筛选 */
const PaneHeader = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex h-13 shrink-0 items-center gap-2 pr-4 pl-6">
    <span className="mr-auto text-14 font-semibold text-primary">{label}</span>
    {children}
  </div>
);

/**
 * 表头第一格的三态复选框：只动当前筛选、搜索下可勾的行，已在表中的一概不碰。
 */
const HeadCheckbox = ({
  pickedCount,
  selectableCount,
  label,
  onSelectAll,
  onClearAll,
}: {
  pickedCount: number;
  selectableCount: number;
  label: string;
  onSelectAll: () => void;
  onClearAll: () => void;
}) => {
  const isAll = selectableCount > 0 && pickedCount === selectableCount;
  return (
    <span className={cn(HEAD_CELL, "justify-center px-0")}>
      <Checkbox
        checked={isAll}
        indeterminate={pickedCount > 0 && !isAll}
        disabled={selectableCount === 0}
        aria-label={label}
        title={label}
        onChange={() => (isAll ? onClearAll() : onSelectAll())}
      />
    </span>
  );
};

/**
 * 给裁剪表一次加评审（纵轴）和产品（横轴）。左右两栏各自搜索、各自勾选，只勾一边也能提交。
 *
 * 两栏各是一张普通表格。左栏**平铺**：不按阶段折叠，每行一个评审或一个评审活动，阶段、
 * 类型各占一列，活动行缩进一级并在前面淡写所属评审。阶段筛选与搜索叠加生效。
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
        stageDepth: option.stage_depth ?? 0,
        isReview: STAGE_REVIEW_ROOT_KINDS.includes(option.kind as EStageReviewKind),
        kind: option.kind,
        standardCode: option.standard_code,
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
        depth: bucket[0].stageDepth,
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
        // 搜父评审名也带出它下面的活动，跟分组时代「搜到评审 = 看到整组」的手感一致；编号也能搜
        return (
          row.standardCode.toLowerCase().includes(reviewKeyword) ||
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
  const stageOptions = stageChoices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    depth: choice.depth,
    dim: choice.available === 0,
    hint:
      choice.available > 0
        ? t(`${I18N}.add_axes_stage_count`, { count: choice.available })
        : choice.allInMatrix
          ? t(`${I18N}.add_axes_stage_in_matrix`)
          : t(`${I18N}.add_axes_stage_none`),
  }));

  const inMatrixLabel = t(`${I18N}.add_reviews_in_matrix`);

  const renderRow = (row: TFlatRow) => {
    const { templateId, blocked, parentTitle } = row;
    const isPicked = reviewIds.has(templateId);
    // 同一个节点横跨几个阶段时，勾一下几行一起进表 —— 在行上说清楚，别让人以为只加这一行
    const spanned = stagesPerTemplate.get(templateId) ?? 1;
    const cell = cn(BODY_CELL, blocked && "text-placeholder");
    return (
      <label
        key={`${row.stageId}:${templateId}`}
        className={cn(
          REVIEW_COLS,
          blocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-layer-1",
          isPicked && "bg-accent-subtle"
        )}
      >
        <span className={cn(cell, "justify-center px-0")}>
          <Checkbox
            checked={isPicked || blocked === "in_matrix"}
            disabled={Boolean(blocked)}
            onChange={() => toggleReview(templateId)}
          />
        </span>
        <span className={cn(cell, !blocked && "text-secondary")} title={row.stageLabel}>
          <span className="truncate" style={row.stageDepth ? { paddingLeft: row.stageDepth * 12 } : undefined}>
            {row.stageDepth > 0 && <span className="mr-1 text-placeholder">└</span>}
            {row.stageLabel}
          </span>
        </span>
        <span className={cell} title={row.title}>
          {/* 编号定宽打头，活动的缩进放在编号之后，编号竖向对齐 */}
          <span
            className={cn(
              "w-16 shrink-0 truncate font-mono text-12 tabular-nums",
              blocked ? "text-placeholder" : row.isReview ? "font-medium text-primary" : "text-tertiary"
            )}
          >
            {row.standardCode}
          </span>
          <span className={cn("flex min-w-0 flex-1 items-center gap-2", !row.isReview && "pl-5")}>
            {/* 前缀不截断：截一半就认不出是哪个评审了，让活动名去 truncate（悬停看全名） */}
            {parentTitle && <span className="shrink-0 text-placeholder">{parentTitle} ›</span>}
            <span className={cn("min-w-0 truncate", row.isReview && "font-semibold")}>{row.title}</span>
            {spanned > 1 && (
              <span className="shrink-0 text-12 text-placeholder">
                {t(`${I18N}.add_axes_multi_stage`, { stages: spanned })}
              </span>
            )}
          </span>
        </span>
        <span className={cn(cell, !blocked && "text-secondary")}>
          {t(`workspace_templates.reviews.kind.${row.kind}`)}
        </span>
        <span className={cell}>{blocked ? inMatrixLabel : <span className="text-placeholder">—</span>}</span>
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
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VXL}>
      <TailoringModalHeader title={t(`${I18N}.add_axes_title`)} onClose={onClose} />

      <div className="grid h-[min(32rem,65vh)] grid-cols-[minmax(0,1fr)_22rem] divide-x divide-subtle">
        {/* 左：评审 */}
        <section className="flex min-h-0 flex-col">
          <PaneHeader label={t(`${I18N}.add_axes_reviews`)}>
            <StageFilterChip
              label={t(`${I18N}.add_axes_stage_filter`)}
              allLabel={t(`${I18N}.add_axes_stage_all`)}
              value={stageFilter}
              options={stageOptions}
              allHint={String(rows.filter((row) => !row.blocked).length)}
              onChange={setStageFilter}
            />
            <ModalSearch
              id="review-tailoring-add-axes-reviews-search"
              value={reviewQuery}
              placeholder={t(`${I18N}.add_reviews_search`)}
              onChange={setReviewQuery}
            />
          </PaneHeader>
          <div className={cn(REVIEW_COLS, "shrink-0 border-t border-subtle")}>
            <HeadCheckbox
              pickedCount={pickedVisibleReviews}
              selectableCount={selectableReviewIds.length}
              label={t(`${I18N}.add_axes_select_all`)}
              onSelectAll={selectAllReviews}
              onClearAll={clearAllReviews}
            />
            <span className={HEAD_CELL}>{t(`${I18N}.add_axes_col_stage`)}</span>
            <span className={HEAD_CELL}>
              <span className="w-16 shrink-0 truncate">{t(`${I18N}.add_axes_col_code`)}</span>
              {t(`${I18N}.add_axes_col_review`)}
            </span>
            <span className={HEAD_CELL}>{t("review_tailoring.matrix.type_column")}</span>
            <span className={HEAD_CELL}>{t("review_tailoring.list.status")}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoadingReviews ? (
              listLoader
            ) : rows.length === 0 ? (
              <p className="px-6 py-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_empty_${tailoringKind}`)}</p>
            ) : visibleRows.length === 0 ? (
              <p className="px-6 py-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_no_match`)}</p>
            ) : (
              visibleRows.map(renderRow)
            )}
          </div>
        </section>

        {/* 右：产品 */}
        <section className="flex min-h-0 flex-col">
          <PaneHeader label={t(`${I18N}.add_axes_products`)}>
            <ModalSearch
              id="review-tailoring-add-axes-products-search"
              value={productQuery}
              placeholder={t(`${I18N}.add_products_search`)}
              onChange={setProductQuery}
              className="w-44"
            />
          </PaneHeader>
          <div className={cn(PRODUCT_COLS, "shrink-0 border-t border-subtle")}>
            <HeadCheckbox
              pickedCount={pickedVisibleProducts}
              selectableCount={selectableProductIds.length}
              label={t(`${I18N}.add_axes_select_all`)}
              onSelectAll={selectAllProducts}
              onClearAll={clearAllProducts}
            />
            <span className={HEAD_CELL}>{t(`${I18N}.add_axes_col_product`)}</span>
            <span className={HEAD_CELL}>{t("review_tailoring.list.status")}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoadingProducts ? (
              listLoader
            ) : links.length === 0 ? (
              <p className="px-6 py-6 text-13 text-tertiary">{t(`${I18N}.add_products_empty`)}</p>
            ) : visibleLinks.length === 0 ? (
              <p className="px-6 py-6 text-13 text-tertiary">{t(`${I18N}.add_products_no_match`)}</p>
            ) : (
              visibleLinks.map((link) => {
                const inMatrix = takenProducts.has(link.product);
                const isPicked = productIds.includes(link.product);
                const cell = cn(BODY_CELL, inMatrix && "text-placeholder");
                return (
                  <label
                    key={link.product}
                    className={cn(
                      PRODUCT_COLS,
                      inMatrix ? "cursor-not-allowed" : "cursor-pointer hover:bg-layer-1",
                      isPicked && "bg-accent-subtle"
                    )}
                  >
                    <span className={cn(cell, "justify-center px-0")}>
                      <Checkbox
                        checked={isPicked || inMatrix}
                        disabled={inMatrix}
                        onChange={() => toggleProduct(link.product)}
                      />
                    </span>
                    <span className={cn(cell, "gap-2.5")}>
                      <span className="truncate">{link.product_name}</span>
                      {link.product_code && (
                        <span className="shrink-0 text-12 text-placeholder tabular-nums">{link.product_code}</span>
                      )}
                    </span>
                    <span className={cell}>
                      {inMatrix ? t(`${I18N}.add_products_in_matrix`) : <span className="text-placeholder">—</span>}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </section>
      </div>

      <TailoringModalFooter hint={<span className="tabular-nums">{summary}</span>}>
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
          {t("add")}
        </Button>
      </TailoringModalFooter>
    </ModalCore>
  );
});
