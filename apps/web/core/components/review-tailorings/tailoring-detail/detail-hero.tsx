import { useEffect, useState } from "react";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TReviewTailoringDetail } from "@plane/types";
import { EReviewTailoringStatus } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { descriptionHtmlToText, toDescriptionHtml } from "../description-text";
import { formatShortDate, formatUpdatedAt } from "../list/tailoring-row";
import { ReviewTailoringStatusBadge } from "../status-badge";
import type { TTailoringStats } from "./tailoring-matrix-model";

const I18N = "review_tailoring";

type TStatTile = {
  key: string;
  label: React.ReactNode;
  value: React.ReactNode;
  foot?: React.ReactNode;
  tone?: "warning" | "accent";
};

const TONE: Record<NonNullable<TStatTile["tone"]>, string> = {
  warning: "bg-warning-subtle text-warning-primary",
  accent: "bg-accent-subtle text-accent-primary",
};

/** 一格数字：标签 / 大号数字 / 进度条或一行小字 */
const StatTile = ({ label, value, foot, tone }: Omit<TStatTile, "key">) => (
  <div className={cn("flex min-w-30 flex-col justify-center gap-0.5 px-4 py-2.5", tone && TONE[tone])}>
    <span className={cn("flex items-center gap-1 text-11", tone ? "" : "text-tertiary")}>{label}</span>
    <span className={cn("flex items-baseline gap-1 text-20 leading-tight font-semibold tabular-nums", !tone && "text-primary")}>
      {value}
    </span>
    {foot}
  </div>
);

const Bar = ({ ratio, className }: { ratio: number; className: string }) => (
  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-layer-3">
    <span className={cn("block h-full rounded-full bg-current", className)} style={{ width: `${Math.round(ratio * 100)}%` }} />
  </span>
);

/**
 * 标题区：左边是「这是哪张表」（标题 / 状态 / 一行小字 / 描述），右边三格数字是「进展到哪」。
 *
 * 三格随状态换：可编辑时第三格是缺原因（提交前要补齐）；签批中与修订中是「生效后」会增删多少
 * 条评审；已生效是已经生成了多少条。数字全部读本地格子，勾一下就跟着变。
 */
export const DetailHero = ({
  detail,
  stats,
  canManage,
  isEditingDescription,
  onEditingDescriptionChange,
  onTitleSave,
  onDescriptionSave,
}: {
  detail: TReviewTailoringDetail;
  stats: TTailoringStats;
  canManage: boolean;
  isEditingDescription: boolean;
  onEditingDescriptionChange: (editing: boolean) => void;
  onTitleSave: (title: string) => void;
  onDescriptionSave: (descriptionHtml: string) => void;
}) => {
  const { t, currentLocale } = useTranslation();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(detail.title);
  const description = descriptionHtmlToText(detail.description_html);
  const [draftDescription, setDraftDescription] = useState(description);

  useEffect(() => setDraftTitle(detail.title), [detail.title]);
  useEffect(() => {
    if (isEditingDescription) setDraftDescription(description);
  }, [isEditingDescription, description]);

  const { status } = detail;
  const isEditable = status === EReviewTailoringStatus.DRAFT || status === EReviewTailoringStatus.REVISING;

  const commitTitle = () => {
    const next = draftTitle.trim();
    if (next && next !== detail.title) onTitleSave(next);
    else setDraftTitle(detail.title);
    setIsEditingTitle(false);
  };

  const commitDescription = () => {
    const next = draftDescription.trim();
    if (next !== description) onDescriptionSave(next ? toDescriptionHtml(next) : "");
    onEditingDescriptionChange(false);
  };

  // ---- 一行小字 ----
  const effectiveText =
    detail.revision === 0
      ? t(`${I18N}.list.never_effective`)
      : t(`${I18N}.detail.effective`, {
          count: detail.revision,
          date: detail.approved_at ? formatShortDate(detail.approved_at, currentLocale) : "",
        });
  const person =
    status === EReviewTailoringStatus.PENDING && detail.submitted_by_detail
      ? {
          user: detail.submitted_by_detail,
          text: t(`${I18N}.detail.submitted_by`, {
            name: detail.submitted_by_detail.display_name,
            date: detail.submitted_at ? formatUpdatedAt(detail.submitted_at, currentLocale, t) : "",
          }),
        }
      : detail.created_by_detail
        ? {
            user: detail.created_by_detail,
            text: t(`${I18N}.detail.created_by`, {
              name: detail.created_by_detail.display_name,
              date: formatShortDate(detail.created_at, currentLocale),
            }),
          }
        : null;

  // ---- 右侧三格 ----
  const ratio = (value: number) => (stats.total > 0 ? value / stats.total : 0);
  const tiles: TStatTile[] = [
    {
      key: "selected",
      label: t(`${I18N}.detail.stat_selected`),
      value: (
        <>
          {stats.selected}
          <small className="text-12 font-normal text-placeholder">/ {stats.total}</small>
        </>
      ),
      foot: <Bar ratio={ratio(stats.selected)} className="text-accent-primary" />,
    },
  ];
  if (status !== EReviewTailoringStatus.REVISING) {
    tiles.push({
      key: "cut",
      label: t(`${I18N}.detail.stat_cut`),
      value: stats.cut,
      foot: <Bar ratio={ratio(stats.cut)} className="text-placeholder" />,
    });
  }
  if (status === EReviewTailoringStatus.PENDING || status === EReviewTailoringStatus.REVISING) {
    tiles.push({
      key: "after",
      tone: "accent",
      label: t(`${I18N}.detail.stat_after`),
      value: (
        <>
          +{stats.toCreate}
          <small className="text-12 font-normal">−{stats.toDelete}</small>
        </>
      ),
      foot: (
        <span className="text-11">
          {t(`${I18N}.detail.stat_after_hint`, { created: stats.toCreate, deleted: stats.toDelete })}
        </span>
      ),
    });
  }
  if (isEditable && (status === EReviewTailoringStatus.DRAFT || stats.missing > 0)) {
    tiles.push({
      key: "missing",
      tone: stats.missing > 0 ? "warning" : undefined,
      label: (
        <>
          {stats.missing > 0 && <AlertTriangle className="size-3" />}
          {t(`${I18N}.detail.stat_missing`)}
        </>
      ),
      value: stats.missing,
      foot: (
        <span className={cn("text-11", stats.missing === 0 && "text-tertiary")}>
          {stats.missing > 0 ? t(`${I18N}.detail.stat_missing_hint`) : t(`${I18N}.detail.stat_missing_done`)}
        </span>
      ),
    });
  }
  if (status === EReviewTailoringStatus.APPROVED) {
    tiles.push({
      key: "generated",
      label: t(`${I18N}.detail.stat_generated`),
      value: (
        <>
          {stats.generated}
          <small className="text-12 font-normal text-placeholder">{t(`${I18N}.detail.stat_generated_unit`)}</small>
        </>
      ),
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4 px-6 pt-5 pb-4">
      <div className="flex min-w-0 flex-1 basis-96 flex-col gap-2">
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

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-13 text-tertiary">
          <span className="tabular-nums">
            {t(`${I18N}.detail.axis_meta`, {
              reviews: detail.review_count,
              products: detail.product_count,
              cells: stats.total,
            })}
          </span>
          <span className="text-placeholder">·</span>
          <span className="tabular-nums">{effectiveText}</span>
          {status === EReviewTailoringStatus.REVISING && detail.pending_change_count > 0 && (
            <>
              <span className="text-placeholder">·</span>
              <span className="font-medium text-accent-primary tabular-nums">
                {t(`${I18N}.detail.pending_changes`, { count: detail.pending_change_count })}
              </span>
            </>
          )}
          {person && (
            <>
              <span className="text-placeholder">·</span>
              <span className="flex items-center gap-1.5">
                <Avatar size="sm" name={person.user.display_name} src={getFileURL(person.user.avatar_url ?? "")} />
                {person.text}
              </span>
            </>
          )}
        </div>

        {isEditingDescription ? (
          <div className="flex max-w-2xl flex-col gap-2">
            <textarea
              id="review-tailoring-description"
              autoFocus
              rows={3}
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onEditingDescriptionChange(false);
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commitDescription();
              }}
              className="w-full resize-none rounded-lg border border-accent-strong bg-surface-1 px-3 py-2 text-13 leading-relaxed text-primary outline-none focus:ring-3 focus:ring-accent-primary/15"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="lg" onClick={() => onEditingDescriptionChange(false)}>
                {t("cancel")}
              </Button>
              <Button variant="primary" size="lg" onClick={commitDescription}>
                {t("save")}
              </Button>
            </div>
          </div>
        ) : description ? (
          <p
            className={cn(
              "max-w-[62ch] text-13 leading-relaxed whitespace-pre-line text-secondary",
              canManage && "-mx-1.5 cursor-text rounded-md px-1.5 hover:bg-layer-transparent-hover"
            )}
            onClick={canManage ? () => onEditingDescriptionChange(true) : undefined}
          >
            {description}
          </p>
        ) : (
          canManage && (
            <button
              type="button"
              className="w-fit border-b border-dashed border-strong pb-px text-13 text-placeholder hover:text-tertiary"
              onClick={() => onEditingDescriptionChange(true)}
            >
              {t(`${I18N}.detail.description_placeholder`)}
            </button>
          )
        )}
      </div>

      {stats.total > 0 && (
        <div className="flex shrink-0 divide-x divide-subtle overflow-hidden rounded-lg border border-subtle">
          {tiles.map(({ key, ...tile }) => (
            <StatTile key={key} {...tile} />
          ))}
        </div>
      )}
    </div>
  );
};
