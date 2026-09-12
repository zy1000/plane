import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringRow, TStageReviewTemplate } from "@plane/types";
import { EProductDictionaryKey } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useStageReviewTemplates } from "@/hooks/store/use-stage-review-templates";
import { ModalSearch, TailoringModalHeader } from "./modal-header";

const I18N = "review_tailoring.actions";

type TCandidate = {
  node: TStageReviewTemplate;
  /** 进矩阵时会跟着带进来的活动 = 当前启用的子节点（后端 `axis_templates` 同一口径） */
  activities: TStageReviewTemplate[];
  /** 已在矩阵里 / 模板已停用：列出来但不能勾 */
  blocked: "in_matrix" | "inactive" | null;
};

type TStageBucket = { stageId: string; stageLabel: string; candidates: TCandidate[] };

/**
 * 给裁剪表的纵轴加评审。左边按阶段翻，右边是该阶段的顶层评审；有搜索词时跨阶段搜。
 *
 * 只能勾顶层：它下面的评审活动跟着整块进矩阵（可以展开看会带进来哪些）。已在矩阵里的、
 * 模板已停用的也列出来但锁住 —— 比直接藏掉更不容易让人以为「模板库里没有这条」。
 * 底部实时算「每个产品会新增几格」，主按钮带数量。
 */
export const AddReviewsModal = observer(function AddReviewsModal({
  isOpen,
  isSubmitting,
  workspaceSlug,
  existingRows,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  workspaceSlug: string;
  existingRows: TReviewTailoringRow[];
  onClose: () => void;
  onSubmit: (templateIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const { getDictionaryByKey } = useDataDictionaries(workspaceSlug);
  const stageDictionary = getDictionaryByKey(EProductDictionaryKey.STAGE);
  const stages = useMemo(
    () => (stageDictionary?.items ?? []).map((item) => ({ id: item.id, label: item.label })),
    [stageDictionary]
  );
  const { groups, isLoading } = useStageReviewTemplates(workspaceSlug, stages);

  const [selected, setSelected] = useState<string[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const buckets = useMemo<TStageBucket[]>(() => {
    const taken = new Set(existingRows.filter((row) => !row.parent_template_id).map((row) => row.template_id));
    return groups
      .map((group) => ({
        stageId: group.stageId,
        stageLabel: group.stageLabel,
        candidates: group.nodes.map(({ node, children }) => ({
          node,
          activities: children.filter((child) => child.is_active),
          blocked: taken.has(node.id) ? ("in_matrix" as const) : !node.is_active ? ("inactive" as const) : null,
        })),
      }))
      .filter((bucket) => bucket.candidates.length > 0);
  }, [groups, existingRows]);

  const available = (bucket: TStageBucket) => bucket.candidates.filter((candidate) => !candidate.blocked);
  const hasAnyAvailable = buckets.some((bucket) => available(bucket).length > 0);

  useEffect(() => {
    if (!isOpen) return;
    setSelected([]);
    setExpanded(new Set());
    setQuery("");
    setActiveStageId(null);
  }, [isOpen]);

  // 默认停在第一个还有评审可加的阶段
  const activeBucket =
    buckets.find((bucket) => bucket.stageId === activeStageId) ??
    buckets.find((bucket) => available(bucket).length > 0) ??
    buckets[0];

  const keyword = query.trim().toLowerCase();
  const visibleBuckets: TStageBucket[] = keyword
    ? buckets
        .map((bucket) => ({
          ...bucket,
          candidates: bucket.candidates.filter((candidate) => candidate.node.title.toLowerCase().includes(keyword)),
        }))
        .filter((bucket) => bucket.candidates.length > 0)
    : activeBucket
      ? [activeBucket]
      : [];

  const toggle = (templateId: string) =>
    setSelected((current) =>
      current.includes(templateId) ? current.filter((id) => id !== templateId) : [...current, templateId]
    );

  const toggleExpanded = (templateId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });

  const pickedActivities = buckets
    .flatMap((bucket) => bucket.candidates)
    .filter((candidate) => selected.includes(candidate.node.id))
    .reduce((sum, candidate) => sum + candidate.activities.length, 0);

  const renderCandidate = (candidate: TCandidate) => {
    const { node, activities, blocked } = candidate;
    const isPicked = selected.includes(node.id);
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex h-11 items-center gap-3 px-4 text-14",
            blocked ? "text-placeholder" : "text-primary hover:bg-layer-transparent-hover",
            isPicked && "bg-accent-subtle/60"
          )}
        >
          <label className={cn("flex min-w-0 flex-1 items-center gap-3", !blocked && "cursor-pointer")}>
            <Checkbox checked={isPicked || blocked === "in_matrix"} disabled={Boolean(blocked)} onChange={() => toggle(node.id)} />
            <span className="truncate" title={node.title}>
              {node.title}
            </span>
          </label>
          {blocked ? (
            <span className="shrink-0 rounded border border-subtle px-1.5 text-11 text-placeholder">
              {t(blocked === "in_matrix" ? `${I18N}.add_reviews_in_matrix` : `${I18N}.add_reviews_inactive`)}
            </span>
          ) : (
            activities.length > 0 && (
              <button
                type="button"
                className="flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-12 text-tertiary hover:text-secondary"
                onClick={() => toggleExpanded(node.id)}
              >
                {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {t(`${I18N}.add_reviews_activity_count`, { count: activities.length })}
              </button>
            )
          )}
        </div>
        {isExpanded && !blocked && (
          <ul className="flex flex-col gap-1 pb-2 pl-12 pr-4">
            {activities.map((activity) => (
              <li key={activity.id} className="flex items-center gap-2 text-12 text-tertiary">
                <span className="size-1 shrink-0 rounded-full bg-layer-3-active" />
                <span className="truncate">{activity.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <TailoringModalHeader
        icon={<ListChecks className="size-5" />}
        title={t(`${I18N}.add_reviews_title`)}
        onClose={onClose}
      />

      {isLoading ? (
        <Loader className="space-y-2 px-6 pb-6">
          <Loader.Item height="36px" />
          <Loader.Item height="36px" />
          <Loader.Item height="36px" />
        </Loader>
      ) : buckets.length === 0 ? (
        <p className="px-6 pb-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_empty`)}</p>
      ) : (
        <div className="grid h-[min(26rem,60vh)] grid-cols-[12.5rem_1fr] border-y border-subtle">
          <nav className="flex flex-col gap-0.5 overflow-y-auto border-r border-subtle bg-layer-1 p-2">
            {buckets.map((bucket) => {
              const isActive = !keyword && bucket.stageId === activeBucket?.stageId;
              const stageAvailable = available(bucket);
              const picked = stageAvailable.filter((candidate) => selected.includes(candidate.node.id)).length;
              return (
                <button
                  key={bucket.stageId}
                  type="button"
                  className={cn(
                    "flex h-8.5 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-13",
                    isActive
                      ? "bg-surface-1 font-medium text-primary shadow-raised-100"
                      : "text-secondary hover:bg-layer-transparent-hover"
                  )}
                  onClick={() => {
                    setActiveStageId(bucket.stageId);
                    setQuery("");
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{bucket.stageLabel}</span>
                  {/* 选了几个就显示几个（蓝色）；没选时显示还能加几个；一个都加不了就不显示 */}
                  {stageAvailable.length > 0 && (
                    <span
                      className={cn(
                        "shrink-0 text-12 tabular-nums",
                        picked > 0 ? "font-semibold text-accent-primary" : "text-placeholder"
                      )}
                    >
                      {picked > 0 ? `${picked} / ${stageAvailable.length}` : stageAvailable.length}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 flex-col">
            <ModalSearch
              id="review-tailoring-add-reviews-search"
              value={query}
              placeholder={t(`${I18N}.add_reviews_search`)}
              onChange={setQuery}
            />
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {visibleBuckets.length === 0 && (
                <p className="px-4 py-6 text-13 text-tertiary">{t(`${I18N}.add_reviews_no_match`)}</p>
              )}
              {visibleBuckets.map((bucket) => {
                const ids = available(bucket).map((candidate) => candidate.node.id);
                const allPicked = ids.length > 0 && ids.every((id) => selected.includes(id));
                return (
                  <div key={bucket.stageId}>
                    <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-12 font-semibold text-tertiary">
                      {bucket.stageLabel}
                      {!keyword && ids.length > 0 && (
                        <button
                          type="button"
                          className="ml-auto font-medium text-accent-primary hover:underline"
                          onClick={() =>
                            setSelected((current) =>
                              allPicked
                                ? current.filter((id) => !ids.includes(id))
                                : [...new Set([...current, ...ids])]
                            )
                          }
                        >
                          {t(allPicked ? `${I18N}.add_reviews_clear_stage` : `${I18N}.add_reviews_pick_stage`)}
                        </button>
                      )}
                    </div>
                    {bucket.candidates.map(renderCandidate)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2.5 px-6 pt-4 pb-5">
        {buckets.length > 0 && !hasAnyAvailable && (
          <span className="flex-1 text-12 text-tertiary">{t(`${I18N}.add_reviews_empty`)}</span>
        )}
        {selected.length > 0 && (
          <span className="flex-1 text-12 text-tertiary tabular-nums">
            {t(`${I18N}.add_reviews_summary`, {
              reviews: selected.length,
              activities: pickedActivities,
              cells: selected.length + pickedActivities,
            })}
          </span>
        )}
        <Button variant="secondary" size="xl" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          size="xl"
          loading={isSubmitting}
          disabled={selected.length === 0 || isSubmitting}
          onClick={() => onSubmit(selected)}
        >
          {t(`${I18N}.add_reviews_apply`, { count: selected.length })}
        </Button>
      </div>
    </ModalCore>
  );
});
