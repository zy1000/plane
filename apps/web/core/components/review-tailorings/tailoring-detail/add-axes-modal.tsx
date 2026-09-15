import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Boxes, ChevronDown, ChevronRight, ChevronUp, ListChecks, Package, Plus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  TAddReviewTailoringAxesPayload,
  TReviewTailoringProduct,
  TReviewTailoringRow,
  TStageReviewTemplate,
} from "@plane/types";
import { EProductDictionaryKey } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useProjectProducts } from "@/hooks/store/use-project-products";
import { useStageReviewTemplates } from "@/hooks/store/use-stage-review-templates";
import { ModalSearch, TailoringModalHeader } from "./modal-header";

const I18N = "review_tailoring.actions";

type TBlocked = "in_matrix" | "inactive" | null;

type TNode = {
  node: TStageReviewTemplate;
  /** 已在矩阵里 / 模板已停用：列出来但不能勾 */
  blocked: TBlocked;
};

/** 一个评审和它下面的评审活动。评审与活动的勾选完全独立，互不带动 */
type TCandidate = TNode & { children: TNode[] };

type TStageBucket = { stageId: string; stageLabel: string; candidates: TCandidate[] };

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
  <span className="ml-auto shrink-0 rounded border border-subtle px-1.5 text-11 text-placeholder">{label}</span>
);

/**
 * 给裁剪表一次加评审（纵轴）和产品（横轴）。左右两栏各自搜索、各自勾选，只勾一边也能提交。
 *
 * 左栏按阶段分组，评审与评审活动**各自独立**：勾评审只加评审本身，展开后每个活动单独勾，
 * 只加评审、只加活动、两者都加都行，勾谁都不会带动另一方。
 * 已在表里的、模板已停用的都列出来但锁住 —— 比直接藏掉更不容易让人以为「库里没有这条」。
 * 底部实时算这次会新增多少行、多少格。
 */
export const AddAxesModal = observer(function AddAxesModal({
  isOpen,
  isSubmitting,
  workspaceSlug,
  projectId,
  existingRows,
  existingProducts,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string;
  projectId: string;
  existingRows: TReviewTailoringRow[];
  existingProducts: TReviewTailoringProduct[];
  onClose: () => void;
  onSubmit: (payload: TAddReviewTailoringAxesPayload) => void;
}) {
  const { t } = useTranslation();

  const { getDictionaryByKey } = useDataDictionaries(workspaceSlug);
  const stageDictionary = getDictionaryByKey(EProductDictionaryKey.STAGE);
  const stages = useMemo(
    () => (stageDictionary?.items ?? []).map((item) => ({ id: item.id, label: item.label })),
    [stageDictionary]
  );
  const { groups, isLoading: isLoadingReviews } = useStageReviewTemplates(workspaceSlug, stages);
  const { links, isLoading: isLoadingProducts } = useProjectProducts({ workspaceSlug, projectId });

  /** 勾中的模板节点 id：评审与活动平等，提交时原样发出去 */
  const [reviewIds, setReviewIds] = useState<Set<string>>(new Set());
  const [productIds, setProductIds] = useState<string[]>([]);
  const [reviewQuery, setReviewQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** 用户手动开合过的阶段；没动过的按「还有没有可加的」决定默认开合 */
  const [stageOpen, setStageOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    setReviewIds(new Set());
    setProductIds([]);
    setReviewQuery("");
    setProductQuery("");
    setExpanded(new Set());
    setStageOpen({});
  }, [isOpen]);

  // ---- 评审候选 ----
  const buckets = useMemo<TStageBucket[]>(() => {
    const taken = new Set(existingRows.map((row) => row.template_id));
    const blockedOf = (node: TStageReviewTemplate): TBlocked =>
      taken.has(node.id) ? "in_matrix" : !node.is_active ? "inactive" : null;
    return groups
      .map((group) => ({
        stageId: group.stageId,
        stageLabel: group.stageLabel,
        candidates: group.nodes.map(({ node, children }) => ({
          node,
          blocked: blockedOf(node),
          children: children.map((child) => ({ node: child, blocked: blockedOf(child) })),
        })),
      }))
      .filter((bucket) => bucket.candidates.length > 0);
  }, [groups, existingRows]);

  const reviewKeyword = reviewQuery.trim().toLowerCase();
  const matches = (node: TStageReviewTemplate) => node.title.toLowerCase().includes(reviewKeyword);
  const visibleBuckets = reviewKeyword
    ? buckets
        .map((bucket) => ({
          ...bucket,
          candidates: bucket.candidates.filter(
            (candidate) => matches(candidate.node) || candidate.children.some((child) => matches(child.node))
          ),
        }))
        .filter((bucket) => bucket.candidates.length > 0)
    : buckets;

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
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ---- 底部算账 ----
  const allCandidates = buckets.flatMap((bucket) => bucket.candidates);
  const reviews = allCandidates.filter((candidate) => reviewIds.has(candidate.node.id)).length;
  const activities = allCandidates.reduce(
    (sum, candidate) => sum + candidate.children.filter((child) => reviewIds.has(child.node.id)).length,
    0
  );
  const rows = reviewIds.size;
  const products = productIds.length;
  // 新行 × 全部列（旧列 + 新列）+ 旧行 × 新列
  const cells = rows * (existingProducts.length + products) + existingRows.length * products;
  const summary =
    rows > 0 && products > 0
      ? t(`${I18N}.add_axes_summary`, { reviews, activities, rows, products, cells })
      : rows > 0
        ? t(`${I18N}.add_axes_summary_reviews`, { reviews, activities, rows, cells })
        : products > 0
          ? t(`${I18N}.add_axes_summary_products`, { products, cells })
          : null;
  const applyLabel =
    rows > 0 && products > 0
      ? t(`${I18N}.add_axes_apply`, { rows, products })
      : products > 0
        ? t(`${I18N}.add_axes_apply_products`, { products })
        : rows > 0
          ? t(`${I18N}.add_axes_apply_reviews`, { rows })
          : t("review_tailoring.detail.add_axes");

  const blockedLabel = (blocked: Exclude<TBlocked, null>) =>
    t(blocked === "in_matrix" ? `${I18N}.add_reviews_in_matrix` : `${I18N}.add_reviews_inactive`);

  const renderCandidate = (candidate: TCandidate) => {
    const { node, blocked, children } = candidate;
    const isPicked = reviewIds.has(node.id);
    const isExpanded = Boolean(reviewKeyword) || expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex h-10.5 items-center gap-3 border-b border-subtle px-4 text-13",
            blocked ? "text-placeholder" : "text-primary hover:bg-layer-transparent-hover",
            isPicked && "bg-accent-subtle/60"
          )}
        >
          <label className={cn("flex min-w-0 flex-1 items-center gap-3", !blocked && "cursor-pointer")}>
            <Checkbox
              checked={isPicked || blocked === "in_matrix"}
              disabled={Boolean(blocked)}
              onChange={() => toggleReview(node.id)}
            />
            <span className="truncate" title={node.title}>
              {node.title}
            </span>
          </label>
          {blocked && <LockedTag label={blockedLabel(blocked)} />}
          {children.length > 0 && (
            <button
              type="button"
              className={cn(
                "flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-12 text-tertiary hover:text-secondary",
                !blocked && "ml-auto"
              )}
              onClick={() => toggleExpanded(node.id)}
            >
              {t(`${I18N}.add_reviews_activity_count`, { count: children.length })}
              {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          )}
        </div>
        {isExpanded &&
          children.map((child) => {
            const isChildPicked = reviewIds.has(child.node.id);
            return (
              <label
                key={child.node.id}
                className={cn(
                  "flex h-9 items-center gap-3 border-b border-subtle pr-4 pl-11 text-12.5",
                  child.blocked ? "text-placeholder" : "cursor-pointer text-secondary hover:bg-layer-transparent-hover",
                  isChildPicked && "bg-accent-subtle/60"
                )}
              >
                <Checkbox
                  checked={isChildPicked || child.blocked === "in_matrix"}
                  disabled={Boolean(child.blocked)}
                  onChange={() => toggleReview(child.node.id)}
                />
                <span className="min-w-0 truncate" title={child.node.title}>
                  {child.node.title}
                </span>
                {child.blocked && <LockedTag label={blockedLabel(child.blocked)} />}
              </label>
            );
          })}
      </div>
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
          <PaneHeader icon={<ListChecks className="size-4" />} label={t(`${I18N}.add_axes_reviews`)} count={rows} />
          <ModalSearch
            id="review-tailoring-add-axes-reviews-search"
            value={reviewQuery}
            placeholder={t(`${I18N}.add_reviews_search`)}
            onChange={setReviewQuery}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoadingReviews ? (
              listLoader
            ) : buckets.length === 0 ? (
              <p className="px-4 py-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_empty`)}</p>
            ) : visibleBuckets.length === 0 ? (
              <p className="px-4 py-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_no_match`)}</p>
            ) : (
              visibleBuckets.map((bucket) => {
                const stageEntries = bucket.candidates.flatMap((candidate) => [candidate, ...candidate.children]);
                const availableCount = stageEntries.filter((entry) => !entry.blocked).length;
                const pickedCount = stageEntries.filter((entry) => reviewIds.has(entry.node.id)).length;
                const isStageOpen = reviewKeyword ? true : (stageOpen[bucket.stageId] ?? availableCount > 0);
                const stageNote =
                  availableCount > 0
                    ? t(`${I18N}.add_axes_stage_count`, { count: availableCount })
                    : stageEntries.every((entry) => entry.blocked === "in_matrix")
                      ? t(`${I18N}.add_axes_stage_in_matrix`)
                      : t(`${I18N}.add_axes_stage_none`);
                return (
                  <div key={bucket.stageId}>
                    <button
                      type="button"
                      className="sticky top-0 z-[1] flex h-8 w-full items-center gap-1.5 border-b border-subtle bg-layer-1 px-4 text-left text-12"
                      onClick={() =>
                        setStageOpen((current) => ({ ...current, [bucket.stageId]: !isStageOpen }))
                      }
                    >
                      {isStageOpen ? (
                        <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
                      )}
                      <span className="truncate font-semibold text-secondary">{bucket.stageLabel}</span>
                      <span className="shrink-0 text-placeholder">· {stageNote}</span>
                      {pickedCount > 0 && (
                        <span className="ml-auto shrink-0 font-medium text-accent-primary tabular-nums">
                          {pickedCount}
                        </span>
                      )}
                    </button>
                    {isStageOpen && bucket.candidates.map(renderCandidate)}
                  </div>
                );
              })
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
                      "flex h-10.5 items-center gap-3 border-b border-subtle px-4 text-13",
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
                    <span className="min-w-0 truncate">{link.product_name}</span>
                    {link.product_code && (
                      <span className="shrink-0 text-12 text-placeholder tabular-nums">{link.product_code}</span>
                    )}
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
          disabled={(rows === 0 && products === 0) || isSubmitting}
          onClick={() => onSubmit({ template_ids: [...reviewIds], product_ids: productIds })}
        >
          {applyLabel}
        </Button>
      </div>
    </ModalCore>
  );
});
