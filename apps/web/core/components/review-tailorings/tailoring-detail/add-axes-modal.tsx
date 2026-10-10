import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Layers, Shapes, User, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TAddReviewTailoringAxesPayload,
  TProductProject,
  TReviewTailoringAxisOption,
  TReviewTailoringProduct,
  TReviewTailoringRow,
} from "@plane/types";
import { type EReviewTailoringKind, type EStageReviewKind, STAGE_REVIEW_ROOT_KINDS } from "@plane/types";
import { Avatar, Checkbox, EModalPosition, EModalWidth, Loader, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { DictionaryValueTag, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useTailoringAxisOptions } from "@/hooks/store/use-tailoring-axis-options";
import { ModalSearch, TailoringModalFooter, TailoringModalHeader } from "./modal-frame";
import type { TMultiFilterOption } from "./multi-select-filter-chip";
import { MultiSelectFilterChip } from "./multi-select-filter-chip";
import { splitChildTitle } from "./tailoring-matrix-model";

const I18N = "review_tailoring.actions";

type TPane = "reviews" | "products";

/** 评审清单：勾选 / 编号 / 评审或评审活动 / 类型 / 加入阶段 */
const REVIEW_GRID = "grid grid-cols-[1.25rem_5.5rem_minmax(0,1fr)_6.5rem_11rem] items-center gap-x-3 px-5";
/** 产品清单：勾选 / 开发编号 / 产品名称 / 产品代号 / 产品阶段 / 负责人 */
const PRODUCT_GRID =
  "grid grid-cols-[1.25rem_6.5rem_minmax(0,1fr)_10rem_6rem_7.5rem] items-center gap-x-3 px-5";
const LIST_HEAD = "h-9 shrink-0 border-y border-subtle bg-layer-1 text-12 font-medium text-tertiary";

/**
 * 评审清单的一行 = 一个模板节点。
 *
 * 纵轴按节点存：勾一个节点，等于在本项目每个能选它的阶段下各加一行。所以这里一个节点只占一行，
 * 「加入阶段」列把它会落到的阶段都画出来 —— 跨两个阶段就是两枚，勾下去加几行一眼可见。
 */
type TNodeRow = {
  templateId: string;
  standardCode: string;
  /** 去掉父评审前缀后的标题（取第一个阶段下的行名） */
  title: string;
  kind: string;
  isReview: boolean;
  parentId: string | null;
  parentTitle: string | null;
  childCount: number;
  stages: { id: string; label: string; depth: number }[];
  inMatrix: boolean;
};

/** 已选数量的蓝色小圆：页签上、已选栏头上共用 */
const CountPill = ({ count }: { count: number }) => (
  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-primary px-1.5 text-11 font-semibold text-on-color tabular-nums">
    {count}
  </span>
);

/** 表头第一格的三态复选框：只动当前筛选、搜索下可勾的行，已在表中的一概不碰 */
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
    <Checkbox
      checked={isAll}
      indeterminate={pickedCount > 0 && !isAll}
      disabled={selectableCount === 0}
      aria-label={label}
      title={label}
      onChange={() => (isAll ? onClearAll() : onSelectAll())}
    />
  );
};

/** 「已在表中」的灰标签：行置灰、勾选锁住，但仍列出来 —— 藏掉容易让人以为库里没有这条 */
const InMatrixTag = ({ label }: { label: string }) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded-sm bg-layer-3 px-1.5 text-11 font-medium text-tertiary">
    {label}
  </span>
);

/** 已选栏里的一组 */
const RailGroup = ({ title, count, children }: { title: string; count: number; children: ReactNode }) => (
  <div className="pb-2">
    <div className="flex items-center gap-2 px-5 pt-3 pb-1.5 text-12 font-semibold text-tertiary">
      {title}
      <span className="font-medium text-placeholder tabular-nums">{count}</span>
    </div>
    {children}
  </div>
);

const RailItem = ({
  code,
  title,
  removeLabel,
  onRemove,
}: {
  code: string;
  title: string;
  removeLabel: string;
  onRemove: () => void;
}) => (
  <div className="group mx-2 flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-surface-1">
    <div className="min-w-0 flex-1">
      <div className="truncate font-mono text-11 font-medium text-tertiary tabular-nums">{code}</div>
      <div className="truncate text-13 text-primary" title={title}>
        {title}
      </div>
    </div>
    <button
      type="button"
      aria-label={removeLabel}
      title={removeLabel}
      className="grid size-6 shrink-0 place-items-center rounded text-placeholder hover:bg-layer-transparent-hover hover:text-secondary"
      onClick={onRemove}
    >
      <X className="size-3.5" />
    </button>
  </div>
);

/**
 * 给裁剪表一次加评审（纵轴）和产品（横轴）。
 *
 * 两个页签各是一张可筛选、可搜索的清单，右边常驻「已选」栏（跨页签汇总、可逐条移除），
 * 底部算这次会新增多少行、多少列、多少格。评审与评审活动**各自独立**：只加评审、只加活动、
 * 两者都加都行，勾谁都不会带动另一方。
 *
 * 筛选都是多选、条件之间取交集：评审按阶段 / 类型，产品按产品阶段 / 负责人；
 * 「隐藏已在表中」把锁住的行收起来。
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

  const [pane, setPane] = useState<TPane>("reviews");
  /** 勾中的模板节点 id：评审与活动平等，提交时原样发出去 */
  const [reviewIds, setReviewIds] = useState<Set<string>>(new Set());
  const [productIds, setProductIds] = useState<string[]>([]);
  const [reviewQuery, setReviewQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState<string[]>([]);
  const [productStageFilter, setProductStageFilter] = useState<string[]>([]);
  const [leadFilter, setLeadFilter] = useState<string[]>([]);
  const [hideInMatrix, setHideInMatrix] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPane("reviews");
    setReviewIds(new Set());
    setProductIds([]);
    setReviewQuery("");
    setProductQuery("");
    setStageFilter([]);
    setKindFilter([]);
    setProductStageFilter([]);
    setLeadFilter([]);
    setHideInMatrix(false);
  }, [isOpen]);

  // ---- 评审候选：服务端按「阶段 × 节点」铺平，这里按节点收成一行，评审下面紧跟它的活动 ----
  const nodes = useMemo<TNodeRow[]>(() => {
    // 父评审标题按 (阶段, 节点) 找：同一个活动在两个阶段下的父是各自那个阶段的评审
    const titleByKey = new Map<string, string>();
    for (const option of options) titleByKey.set(`${option.stage_id}:${option.template_id}`, option.title);
    const byTemplate = new Map<string, TNodeRow>();
    for (const option of options as TReviewTailoringAxisOption[]) {
      const stage = { id: option.stage_id, label: option.stage_label, depth: option.stage_depth ?? 0 };
      const existing = byTemplate.get(option.template_id);
      if (existing) {
        existing.stages.push(stage);
        continue;
      }
      const parentTitle = option.parent_template_id
        ? (titleByKey.get(`${option.stage_id}:${option.parent_template_id}`) ?? null)
        : null;
      byTemplate.set(option.template_id, {
        templateId: option.template_id,
        standardCode: option.standard_code,
        title: parentTitle ? splitChildTitle(parentTitle, option.title).rest : option.title,
        kind: option.kind,
        isReview: STAGE_REVIEW_ROOT_KINDS.includes(option.kind as EStageReviewKind),
        parentId: option.parent_template_id,
        parentTitle,
        childCount: 0,
        stages: [stage],
        inMatrix: option.in_matrix,
      });
    }
    const children = new Map<string, TNodeRow[]>();
    const roots: TNodeRow[] = [];
    for (const node of byTemplate.values()) {
      const parent = node.parentId ? byTemplate.get(node.parentId) : undefined;
      if (!parent) {
        roots.push(node);
        continue;
      }
      parent.childCount += 1;
      const bucket = children.get(parent.templateId) ?? [];
      bucket.push(node);
      children.set(parent.templateId, bucket);
    }
    return roots.flatMap((root) => [root, ...(children.get(root.templateId) ?? [])]);
  }, [options]);

  /** 阶段筛选的选项：按候选里出现的顺序（树先序），右侧写还能加几条；不跟搜索词走 */
  const stageChoices = useMemo<TMultiFilterOption[]>(() => {
    const stages = new Map<string, { label: string; depth: number; available: number; total: number }>();
    for (const node of nodes) {
      for (const stage of node.stages) {
        const entry = stages.get(stage.id) ?? { label: stage.label, depth: stage.depth, available: 0, total: 0 };
        entry.total += 1;
        if (!node.inMatrix) entry.available += 1;
        stages.set(stage.id, entry);
      }
    }
    return [...stages.entries()].map(([id, entry]) => ({
      id,
      label: entry.label,
      depth: entry.depth,
      dim: entry.available === 0,
      hint:
        entry.available > 0
          ? t(`${I18N}.add_axes_available`, { count: entry.available })
          : t(`${I18N}.add_axes_all_in_matrix`),
    }));
    // t 每次渲染都是新引用；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const kindChoices = useMemo<TMultiFilterOption[]>(() => {
    const kinds = new Map<string, number>();
    for (const node of nodes) kinds.set(node.kind, (kinds.get(node.kind) ?? 0) + (node.inMatrix ? 0 : 1));
    return [...kinds.entries()].map(([kind, available]) => ({
      id: kind,
      label: t(`workspace_templates.reviews.kind.${kind}`),
      dim: available === 0,
      hint:
        available > 0 ? t(`${I18N}.add_axes_available`, { count: available }) : t(`${I18N}.add_axes_all_in_matrix`),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const reviewKeyword = reviewQuery.trim().toLowerCase();
  const visibleNodes = useMemo(
    () =>
      nodes.filter((node) => {
        if (hideInMatrix && node.inMatrix) return false;
        if (stageFilter.length > 0 && !node.stages.some((stage) => stageFilter.includes(stage.id))) return false;
        if (kindFilter.length > 0 && !kindFilter.includes(node.kind)) return false;
        if (!reviewKeyword) return true;
        // 搜父评审名也带出它下面的活动；编号也能搜
        return (
          node.standardCode.toLowerCase().includes(reviewKeyword) ||
          node.title.toLowerCase().includes(reviewKeyword) ||
          (node.parentTitle ?? "").toLowerCase().includes(reviewKeyword)
        );
      }),
    [nodes, hideInMatrix, stageFilter, kindFilter, reviewKeyword]
  );

  // ---- 产品候选 ----
  const takenProducts = useMemo(() => new Set(existingProducts.map((product) => product.id)), [existingProducts]);

  const productStageChoices = useMemo<TMultiFilterOption[]>(() => {
    const stages = new Map<string, string>();
    for (const link of links) {
      const stage = link.product_stage_detail;
      if (stage && !stages.has(stage.id)) stages.set(stage.id, stage.label);
    }
    return [...stages.entries()].map(([id, label]) => ({ id, label }));
  }, [links]);

  const leadChoices = useMemo<TMultiFilterOption[]>(() => {
    const leads = new Map<string, string>();
    for (const link of links) {
      const lead = link.product_project_lead_detail;
      if (lead && !leads.has(lead.id)) leads.set(lead.id, lead.display_name);
    }
    return [...leads.entries()].map(([id, label]) => ({ id, label }));
  }, [links]);

  const productKeyword = productQuery.trim().toLowerCase();
  const visibleLinks = useMemo(
    () =>
      links.filter((link: TProductProject) => {
        if (hideInMatrix && takenProducts.has(link.product)) return false;
        if (productStageFilter.length > 0 && !productStageFilter.includes(link.product_stage_detail?.id ?? ""))
          return false;
        if (leadFilter.length > 0 && !leadFilter.includes(link.product_project_lead_detail?.id ?? "")) return false;
        if (!productKeyword) return true;
        return [link.product_name, link.product_identifier, link.product_code].some((value) =>
          (value ?? "").toLowerCase().includes(productKeyword)
        );
      }),
    [links, hideInMatrix, takenProducts, productStageFilter, leadFilter, productKeyword]
  );

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
  const selectableReviewIds = visibleNodes.filter((node) => !node.inMatrix).map((node) => node.templateId);
  const pickedVisibleReviews = selectableReviewIds.filter((id) => reviewIds.has(id)).length;
  const selectableProductIds = visibleLinks
    .filter((link) => !takenProducts.has(link.product))
    .map((link) => link.product);
  const pickedVisibleProducts = selectableProductIds.filter((id) => productIds.includes(id)).length;

  // ---- 已选栏与底部算账 ----
  const pickedNodes = nodes.filter((node) => reviewIds.has(node.templateId));
  const pickedLinks = links.filter((link) => productIds.includes(link.product));
  // 勾选以节点为单位，但加进表里的是**行** —— 一个节点横跨两个阶段就是两行
  const rowCount = pickedNodes.reduce((total, node) => total + node.stages.length, 0);
  const products = productIds.length;
  // 新行 × 全部列（旧列 + 新列）+ 旧行 × 新列
  const cells = rowCount * (existingProducts.length + products) + existingRows.length * products;
  const pickedCount = pickedNodes.length + products;
  const summary =
    rowCount > 0 && products > 0
      ? t(`${I18N}.add_axes_summary`, { rows: rowCount, products, cells })
      : rowCount > 0
        ? t(`${I18N}.add_axes_summary_reviews`, { rows: rowCount, cells })
        : products > 0
          ? t(`${I18N}.add_axes_summary_products`, { products, cells })
          : null;

  const inMatrixLabel = t(`${I18N}.add_reviews_in_matrix`);
  const removeLabel = t(`${I18N}.add_axes_remove`);

  const listLoader = (
    <Loader className="space-y-2 p-5">
      <Loader.Item height="40px" />
      <Loader.Item height="40px" />
      <Loader.Item height="40px" />
    </Loader>
  );
  const emptyLine = (text: string) => <p className="px-5 py-8 text-13 text-tertiary">{text}</p>;

  const toolbarCount = (total: number, available: number, key: string) => (
    <span className="ml-auto shrink-0 text-13 text-tertiary tabular-nums">{t(`${I18N}.${key}`, { total, available })}</span>
  );
  const hideToggle = (
    <span className="flex shrink-0 items-center gap-2">
      <ToggleSwitch value={hideInMatrix} onChange={setHideInMatrix} label={t(`${I18N}.add_axes_hide_in_matrix`)} />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className="text-13 whitespace-nowrap text-secondary"
        onClick={() => setHideInMatrix((current) => !current)}
      >
        {t(`${I18N}.add_axes_hide_in_matrix`)}
      </button>
    </span>
  );

  const reviewPane = (
    <>
      <div className="flex shrink-0 items-center gap-2 px-5 py-3">
        <ModalSearch
          id="review-tailoring-add-axes-reviews-search"
          value={reviewQuery}
          placeholder={t(`${I18N}.add_reviews_search`)}
          onChange={setReviewQuery}
          className="w-56"
        />
        <MultiSelectFilterChip
          icon={Layers}
          label={t(`${I18N}.add_axes_stage_filter`)}
          options={stageChoices}
          value={stageFilter}
          onChange={setStageFilter}
        />
        <MultiSelectFilterChip
          icon={Shapes}
          label={t(`${I18N}.add_axes_kind_filter`)}
          options={kindChoices}
          value={kindFilter}
          onChange={setKindFilter}
        />
        {toolbarCount(visibleNodes.length, selectableReviewIds.length, "add_axes_review_count")}
        {hideToggle}
      </div>
      <div className={cn(REVIEW_GRID, LIST_HEAD)}>
        <HeadCheckbox
          pickedCount={pickedVisibleReviews}
          selectableCount={selectableReviewIds.length}
          label={t(`${I18N}.add_axes_select_all`)}
          onSelectAll={() => setReviewIds((current) => new Set([...current, ...selectableReviewIds]))}
          onClearAll={() =>
            setReviewIds((current) => {
              const next = new Set(current);
              for (const id of selectableReviewIds) next.delete(id);
              return next;
            })
          }
        />
        <span>{t(`${I18N}.add_axes_col_code`)}</span>
        <span>{t(`${I18N}.add_axes_col_review`)}</span>
        <span>{t("review_tailoring.matrix.type_column")}</span>
        <span>{t(`${I18N}.add_axes_col_stages`)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoadingReviews
          ? listLoader
          : nodes.length === 0
            ? emptyLine(t(`${I18N}.add_reviews_empty_${tailoringKind}`))
            : visibleNodes.length === 0
              ? emptyLine(t(`${I18N}.add_reviews_no_match`))
              : visibleNodes.map((node) => {
                  const isPicked = reviewIds.has(node.templateId);
                  const locked = node.inMatrix;
                  const meta = node.parentTitle
                    ? t(`${I18N}.add_axes_parent`, { title: node.parentTitle })
                    : node.childCount > 0
                      ? t(`${I18N}.add_axes_children`, { count: node.childCount })
                      : null;
                  return (
                    <label
                      key={node.templateId}
                      className={cn(
                        REVIEW_GRID,
                        "min-h-13 border-b border-subtle py-2",
                        locked ? "cursor-not-allowed" : "cursor-pointer hover:bg-layer-1",
                        isPicked && "bg-accent-subtle hover:bg-accent-subtle"
                      )}
                    >
                      <Checkbox
                        checked={isPicked || locked}
                        disabled={locked}
                        onChange={() => toggleReview(node.templateId)}
                      />
                      <span
                        className={cn(
                          "truncate font-mono text-12 tabular-nums",
                          locked ? "text-placeholder" : node.isReview ? "font-medium text-primary" : "text-tertiary"
                        )}
                        title={node.standardCode}
                      >
                        {node.standardCode}
                      </span>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "truncate text-14",
                              node.isReview && "font-semibold",
                              locked ? "text-placeholder" : "text-primary"
                            )}
                            title={node.title}
                          >
                            {node.title}
                          </span>
                          {locked && <InMatrixTag label={inMatrixLabel} />}
                        </span>
                        {meta && <span className="mt-0.5 block truncate text-12 text-placeholder">{meta}</span>}
                      </span>
                      <span>
                        <StageReviewKindBadge
                          kind={node.kind as EStageReviewKind}
                          className={cn(locked && "opacity-60")}
                        />
                      </span>
                      <span className={cn("flex min-w-0 flex-wrap gap-1", locked && "opacity-60")}>
                        {node.stages.map((stage) => (
                          <span
                            key={stage.id}
                            className="inline-flex h-5.5 items-center rounded-sm border border-subtle bg-layer-1 px-1.5 text-12 text-secondary"
                          >
                            {stage.label}
                          </span>
                        ))}
                      </span>
                    </label>
                  );
                })}
      </div>
    </>
  );

  const productPane = (
    <>
      <div className="flex shrink-0 items-center gap-2 px-5 py-3">
        <ModalSearch
          id="review-tailoring-add-axes-products-search"
          value={productQuery}
          placeholder={t(`${I18N}.add_products_search`)}
          onChange={setProductQuery}
          className="w-56"
        />
        {productStageChoices.length > 0 && (
          <MultiSelectFilterChip
            icon={Layers}
            label={t(`${I18N}.add_axes_col_product_stage`)}
            options={productStageChoices}
            value={productStageFilter}
            onChange={setProductStageFilter}
          />
        )}
        {leadChoices.length > 0 && (
          <MultiSelectFilterChip
            icon={User}
            label={t(`${I18N}.add_axes_col_lead`)}
            options={leadChoices}
            value={leadFilter}
            onChange={setLeadFilter}
          />
        )}
        {toolbarCount(visibleLinks.length, selectableProductIds.length, "add_axes_product_count")}
        {hideToggle}
      </div>
      <div className={cn(PRODUCT_GRID, LIST_HEAD)}>
        <HeadCheckbox
          pickedCount={pickedVisibleProducts}
          selectableCount={selectableProductIds.length}
          label={t(`${I18N}.add_axes_select_all`)}
          onSelectAll={() => setProductIds((current) => [...new Set([...current, ...selectableProductIds])])}
          onClearAll={() => setProductIds((current) => current.filter((id) => !selectableProductIds.includes(id)))}
        />
        <span>{t(`${I18N}.add_axes_col_identifier`)}</span>
        <span>{t(`${I18N}.add_axes_col_product_name`)}</span>
        <span>{t(`${I18N}.add_axes_col_product_code`)}</span>
        <span>{t(`${I18N}.add_axes_col_product_stage`)}</span>
        <span>{t(`${I18N}.add_axes_col_lead`)}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoadingProducts
          ? listLoader
          : links.length === 0
            ? emptyLine(t(`${I18N}.add_products_empty`))
            : visibleLinks.length === 0
              ? emptyLine(t(`${I18N}.add_products_no_match`))
              : visibleLinks.map((link) => {
                  const locked = takenProducts.has(link.product);
                  const isPicked = productIds.includes(link.product);
                  const stage = link.product_stage_detail;
                  const lead = link.product_project_lead_detail;
                  const muted = locked ? "text-placeholder" : "text-secondary";
                  return (
                    <label
                      key={link.product}
                      className={cn(
                        PRODUCT_GRID,
                        "h-12 border-b border-subtle",
                        locked ? "cursor-not-allowed" : "cursor-pointer hover:bg-layer-1",
                        isPicked && "bg-accent-subtle hover:bg-accent-subtle"
                      )}
                    >
                      <Checkbox
                        checked={isPicked || locked}
                        disabled={locked}
                        onChange={() => toggleProduct(link.product)}
                      />
                      <span
                        className={cn(
                          "truncate font-mono text-12 font-medium tabular-nums",
                          locked ? "text-placeholder" : "text-primary"
                        )}
                      >
                        {link.product_identifier || "—"}
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn("truncate text-14", locked ? "text-placeholder" : "text-primary")}
                          title={link.product_name}
                        >
                          {link.product_name}
                        </span>
                        {locked && <InMatrixTag label={t(`${I18N}.add_products_in_matrix`)} />}
                      </span>
                      <span className={cn("truncate text-13", muted)} title={link.product_code || undefined}>
                        {link.product_code || "—"}
                      </span>
                      <span className={cn("min-w-0 text-13", muted, locked && "opacity-60")}>
                        {stage ? (
                          <DictionaryValueTag label={stage.label} color={resolveDictionaryItemColor(stage)} />
                        ) : (
                          "—"
                        )}
                      </span>
                      <span className={cn("flex min-w-0 items-center gap-1.5 text-13", muted)}>
                        {lead ? (
                          <>
                            <Avatar
                              name={lead.display_name}
                              src={getFileURL(lead.avatar_url ?? "")}
                              showTooltip={false}
                              size="sm"
                            />
                            <span className="truncate">{lead.display_name}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </label>
                  );
                })}
      </div>
    </>
  );

  const paneTabs: { key: TPane; label: string; picked: number }[] = [
    { key: "reviews", label: t(`${I18N}.add_axes_tab_reviews`), picked: pickedNodes.length },
    { key: "products", label: t(`${I18N}.add_axes_products`), picked: products },
  ];

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VIXL}>
      <TailoringModalHeader title={t(`${I18N}.add_axes_title`)} onClose={onClose} className="border-b-0" />

      <div className="flex h-11 shrink-0 items-stretch gap-2 border-b border-subtle px-4">
        {paneTabs.map((entry) => {
          const isActive = entry.key === pane;
          return (
            <button
              key={entry.key}
              type="button"
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-2 text-14 transition-colors",
                isActive
                  ? "border-accent-strong font-semibold text-primary"
                  : "border-transparent font-medium text-tertiary hover:text-secondary"
              )}
              onClick={() => setPane(entry.key)}
            >
              {entry.label}
              {entry.picked > 0 && <CountPill count={entry.picked} />}
            </button>
          );
        })}
      </div>

      <div className="flex h-[min(36rem,64vh)] min-h-0">
        <section className="flex min-w-0 flex-1 flex-col">{pane === "reviews" ? reviewPane : productPane}</section>

        <aside className="flex w-72 shrink-0 flex-col border-l border-subtle bg-layer-1">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-subtle pr-4 pl-5">
            <span className="text-14 font-semibold text-primary">{t(`${I18N}.add_axes_picked`)}</span>
            {pickedCount > 0 && <CountPill count={pickedCount} />}
            {pickedCount > 0 && (
              <button
                type="button"
                className="ml-auto text-13 text-tertiary hover:text-secondary"
                onClick={() => {
                  setReviewIds(new Set());
                  setProductIds([]);
                }}
              >
                {t(`${I18N}.add_axes_clear_all`)}
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {pickedCount === 0 ? (
              <p className="px-5 py-6 text-13 leading-relaxed text-placeholder">{t(`${I18N}.add_axes_picked_empty`)}</p>
            ) : (
              <>
                {pickedNodes.length > 0 && (
                  <RailGroup title={t(`${I18N}.add_axes_tab_reviews`)} count={pickedNodes.length}>
                    {pickedNodes.map((node) => (
                      <RailItem
                        key={node.templateId}
                        code={node.standardCode}
                        title={node.title}
                        removeLabel={removeLabel}
                        onRemove={() => toggleReview(node.templateId)}
                      />
                    ))}
                  </RailGroup>
                )}
                {pickedLinks.length > 0 && (
                  <RailGroup title={t(`${I18N}.add_axes_products`)} count={pickedLinks.length}>
                    {pickedLinks.map((link) => (
                      <RailItem
                        key={link.product}
                        code={link.product_identifier}
                        title={link.product_name}
                        removeLabel={removeLabel}
                        onRemove={() => toggleProduct(link.product)}
                      />
                    ))}
                  </RailGroup>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      <TailoringModalFooter hint={summary && <span className="tabular-nums">{summary}</span>}>
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={pickedCount === 0 || isSubmitting}
          onClick={() => onSubmit({ template_ids: [...reviewIds], product_ids: productIds })}
        >
          {pickedCount > 0 ? t(`${I18N}.add_axes_submit`, { count: pickedCount }) : t("add")}
        </Button>
      </TailoringModalFooter>
    </ModalCore>
  );
});
