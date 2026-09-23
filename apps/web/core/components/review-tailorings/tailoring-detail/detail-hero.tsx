import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { descriptionHtmlToText, toDescriptionHtml } from "../description-text";
import { ReviewTailoringStatusBadge } from "../status-badge";
import { DescriptionEditor } from "./description-editor";
import { StackBar } from "./stack-bar";
import type { TTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring";

/** 进度条右侧的一项：色块 + 大号数字 + 标签 */
const LegendItem = ({
  swatch,
  value,
  label,
  valueClassName,
}: {
  swatch?: string;
  value: ReactNode;
  label: string;
  valueClassName?: string;
}) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    {swatch && <span className={cn("size-2 shrink-0 rounded-[2px]", swatch)} />}
    <span className={cn("text-18 leading-none font-semibold text-primary tabular-nums", valueClassName)}>{value}</span>
    <span>{label}</span>
  </span>
);

/**
 * 标题区：标题 + 状态药丸，描述（就地编辑，见 `DescriptionEditor`），下面一条「保留 / 裁剪 / 待补原因」进度条。
 *
 * 右侧数字随状态换：可编辑时带「待补原因」（提交前要补齐）；签批中与修订中带「生效后」会增删
 * 多少条评审；已生效带已经生成了多少条。数字全部读本地格子，改一格就跟着变。
 */
export const DetailHero = ({
  detail,
  stats,
  canManage,
  onTitleSave,
  onDescriptionSave,
}: {
  detail: TReviewTailoringDetail;
  stats: TTailoringStats;
  canManage: boolean;
  onTitleSave: (title: string) => void;
  onDescriptionSave: (descriptionHtml: string) => void;
}) => {
  const { t } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(detail.title);
  const description = descriptionHtmlToText(detail.description_html);

  useEffect(() => setDraftTitle(detail.title), [detail.title]);

  const { status } = detail;
  const isEditable = status === EReviewTailoringStatus.DRAFT || status === EReviewTailoringStatus.REVISING;

  const commitTitle = () => {
    const next = draftTitle.trim();
    if (next && next !== detail.title) onTitleSave(next);
    else setDraftTitle(detail.title);
    setIsEditingTitle(false);
  };

  return (
    <div className="flex flex-col gap-3 px-6 pt-5 pb-4">
      {isEditingTitle ? (
        <div className="flex items-center gap-1.5">
          <input
            id="review-tailoring-title"
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraftTitle(detail.title);
                setIsEditingTitle(false);
              }
              if (event.key === "Enter") commitTitle();
            }}
            className="h-9 min-w-0 flex-1 rounded-md border border-accent-strong bg-surface-1 px-2 text-20 font-semibold text-primary outline-none"
          />
          <button
            type="button"
            aria-label={t("save")}
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            onClick={commitTitle}
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            aria-label={t("cancel")}
            className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            onClick={() => {
              setDraftTitle(detail.title);
              setIsEditingTitle(false);
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="group flex min-w-0 items-center gap-3">
          <h1 className="truncate text-20 leading-snug font-semibold text-primary">{detail.title}</h1>
          <ReviewTailoringStatusBadge status={status} showDot className="px-2.5 py-1 text-12" />
          {canManage && (
            <button
              type="button"
              title={t(`${I18N}.detail.edit_title`)}
              className="grid size-7 place-items-center rounded-md text-tertiary opacity-0 transition group-hover:opacity-100 hover:bg-layer-transparent-hover hover:text-primary focus-visible:opacity-100"
              onClick={() => setIsEditingTitle(true)}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <DescriptionEditor
        value={description}
        // 签批中 / 已生效只读，与矩阵一致
        editable={canManage && isEditable}
        onSave={(text) => onDescriptionSave(text ? toDescriptionHtml(text) : "")}
      />

      {stats.total > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-7 gap-y-2">
          <StackBar
            kept={stats.selected}
            cut={stats.cut}
            missing={stats.missing}
            className="h-2 min-w-60 flex-1"
          />
          <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-13 text-tertiary">
            <LegendItem swatch="bg-accent-primary" value={stats.selected} label={t(`${I18N}.detail.stat_selected`)} />
            <LegendItem
              swatch="bg-(--text-color-placeholder)"
              value={stats.cut}
              label={t(`${I18N}.detail.stat_cut`)}
            />
            {isEditable && (
              <LegendItem
                swatch="bg-warning-primary"
                value={stats.missing}
                label={t(`${I18N}.detail.stat_missing`)}
                valueClassName={stats.missing > 0 ? "text-warning-primary" : undefined}
              />
            )}
            {(status === EReviewTailoringStatus.PENDING || status === EReviewTailoringStatus.REVISING) && (
              // 先说明后数字：「生效后 +4 −0」，新建绿、删除灰，竖线与保留 / 裁剪计数隔开
              <span className="inline-flex items-center gap-2 border-l border-subtle pl-5 whitespace-nowrap">
                <span>{t(`${I18N}.detail.stat_after`)}</span>
                <span className="text-18 leading-none font-semibold text-success-primary tabular-nums">
                  +{stats.toCreate}
                </span>
                <span className="text-18 leading-none font-semibold text-tertiary tabular-nums">−{stats.toDelete}</span>
                {/* 修订里挪过阶段的活动：生效时实例跟着挪，id 不变 */}
                {stats.toMove > 0 && (
                  <>
                    <span className="ml-1.5">{t(`${I18N}.move_stage.stat_moved`)}</span>
                    <span className="text-18 leading-none font-semibold text-accent-primary tabular-nums">
                      {stats.toMove}
                    </span>
                  </>
                )}
              </span>
            )}
            {status === EReviewTailoringStatus.APPROVED && (
              <LegendItem
                value={stats.generated}
                label={t(`${I18N}.detail.stat_generated`)}
                valueClassName="text-success-primary"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
