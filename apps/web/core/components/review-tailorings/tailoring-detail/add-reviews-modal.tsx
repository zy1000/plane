import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringRow } from "@plane/types";
import { EProductDictionaryKey } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useStageReviewTemplates } from "@/hooks/store/use-stage-review-templates";

/**
 * 给裁剪表的纵轴加评审。候选 = 模板库里**启用中的顶层评审** − 表里已有的。
 *
 * 只能勾顶层：它下面的评审活动跟着整块进矩阵。「这个评审要做，但其中某个活动不做」是
 * 矩阵里取消勾选 + 写裁剪原因的事；而跟本项目无关的评审干脆不加进来，就不必为它编理由。
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /** 已在纵轴上的顶层评审不再出现在候选里 */
  const candidates = useMemo(() => {
    const taken = new Set(existingRows.filter((row) => !row.parent_template_id).map((row) => row.template_id));
    return groups
      .map((group) => ({
        stageId: group.stageId,
        stageLabel: group.stageLabel,
        nodes: group.nodes.filter((entry) => entry.node.is_active && !taken.has(entry.node.id)),
      }))
      .filter((group) => group.nodes.length > 0);
  }, [groups, existingRows]);

  useEffect(() => {
    if (!isOpen) return;
    setSelected([]);
    setCollapsed(new Set());
  }, [isOpen]);

  const toggle = (templateId: string) =>
    setSelected((current) =>
      current.includes(templateId) ? current.filter((id) => id !== templateId) : [...current, templateId]
    );

  const toggleStage = (stageId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">{t("review_tailoring.actions.add_reviews_title")}</h2>
        <p className="mt-1 text-11 text-tertiary">{t("review_tailoring.actions.add_reviews_hint")}</p>

        <div className="mt-4">
          {isLoading ? (
            <p className="text-12 text-tertiary">…</p>
          ) : candidates.length === 0 ? (
            <p className="text-12 text-tertiary">{t("review_tailoring.actions.add_reviews_empty")}</p>
          ) : (
            <div className="max-h-[50vh] divide-y divide-subtle overflow-y-auto rounded border border-subtle">
              {candidates.map((group) => {
                const isCollapsed = collapsed.has(group.stageId);
                const stageIds = group.nodes.map((entry) => entry.node.id);
                const pickedInStage = stageIds.filter((id) => selected.includes(id)).length;
                return (
                  <div key={group.stageId}>
                    <div className="flex items-center gap-2 bg-layer-1 px-3 py-1.5">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        onClick={() => toggleStage(group.stageId)}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
                        ) : (
                          <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
                        )}
                        <span className="truncate text-12 font-semibold text-primary">{group.stageLabel}</span>
                        <span className="shrink-0 text-10 text-tertiary tabular-nums">
                          {pickedInStage}/{stageIds.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 text-11 text-accent-primary hover:underline"
                        onClick={() =>
                          setSelected((current) =>
                            pickedInStage === stageIds.length
                              ? current.filter((id) => !stageIds.includes(id))
                              : [...new Set([...current, ...stageIds])]
                          )
                        }
                      >
                        {pickedInStage === stageIds.length
                          ? t("review_tailoring.actions.add_reviews_clear_stage")
                          : t("review_tailoring.actions.add_reviews_pick_stage")}
                      </button>
                    </div>

                    {!isCollapsed &&
                      group.nodes.map((entry) => (
                        <label
                          key={entry.node.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-layer-1",
                            selected.includes(entry.node.id) && "bg-layer-1"
                          )}
                        >
                          <Checkbox
                            checked={selected.includes(entry.node.id)}
                            onChange={() => toggle(entry.node.id)}
                          />
                          <span className="min-w-0 flex-1 truncate text-12 text-primary">{entry.node.title}</span>
                          <span className="shrink-0 text-11 text-tertiary">
                            {t("review_tailoring.actions.add_reviews_activity_count", {
                              count: entry.children.length,
                            })}
                          </span>
                        </label>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isSubmitting}
            disabled={selected.length === 0 || isSubmitting}
            onClick={() => onSubmit(selected)}
          >
            {t("review_tailoring.actions.add_reviews_apply", { count: selected.length })}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
