"use client";

/**
 * 历史行里的「字段名 | 旧值 → 新值」面板。
 *
 * 短值用色块（旧红删除线、新绿），描述与富文本走行内文字 diff，附件列增删，
 * 子表单只说一句「有变化」—— 逐行铺开会把一条历史撑成半屏，真要看去「完整对比」。
 * 默认只出前几行，其余折在「还有 N 处变化」后。
 */
import { useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, ChevronUp, FileText, GitCompareArrows } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementAssetRef, TRequirementValue } from "@plane/types";
import { cn, stripAndTruncateHTML } from "@plane/utils";
import { BuiltinCellValue } from "@/components/requirements/requirement-builtin-fields";
import { LeafValue } from "@/components/requirements/requirement-grid-shared";
import { InlineTextDiff } from "@/components/common/inline-text-diff";
import type { TSnapshotDiff, TSnapshotDiffMode, TSnapshotDiffRow } from "./requirement-snapshot-diff";

const DEFAULT_LIMIT = 3;
const RICH_TEXT_PREVIEW_LENGTH = 180;

const VALUE_BLOCK = "inline-flex min-h-[22px] max-w-full items-center gap-1 rounded px-1.5 text-body-xs-regular";
const OLD_BLOCK = cn(VALUE_BLOCK, "bg-danger-subtle text-danger-secondary line-through");
const NEW_BLOCK = cn(VALUE_BLOCK, "bg-success-subtle font-medium text-success-primary");

const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const EmptyValue = () => {
  const { t } = useTranslation();
  return (
    <span className="text-body-xs-regular text-placeholder">
      {t("workspace_products.requirements.change.empty_value")}
    </span>
  );
};

/** 一侧的值。空值统一落到占位符，避免「没填」和「被清空」看起来一样 */
const SideValue = ({
  row,
  value,
  tone,
  workspaceSlug,
}: {
  row: TSnapshotDiffRow;
  value: TRequirementValue | undefined;
  tone: "old" | "new";
  workspaceSlug: string;
}) => {
  if (isEmptyValue(value)) return <EmptyValue />;
  const block = tone === "old" ? OLD_BLOCK : NEW_BLOCK;
  if (row.isRichText) {
    return <span className={block}>{stripAndTruncateHTML(String(value), RICH_TEXT_PREVIEW_LENGTH)}</span>;
  }
  if (row.kind === "builtin" && row.columnKey) {
    return (
      <span className={block}>
        <BuiltinCellValue columnKey={row.columnKey} values={{ [row.columnKey]: value } as never} />
      </span>
    );
  }
  if (row.field) {
    return (
      <span className={block}>
        <LeafValue field={row.field} value={value} workspaceSlug={workspaceSlug} />
      </span>
    );
  }
  return <span className={block}>{String(value)}</span>;
};

const AttachmentChip = ({ asset, tone }: { asset: TRequirementAssetRef; tone: "old" | "new" }) => (
  <span className={tone === "old" ? OLD_BLOCK : NEW_BLOCK} title={asset.name}>
    <FileText className="size-3.5 shrink-0" />
    <span className="truncate">{asset.name}</span>
  </span>
);

/** 附件按 asset_id 求增删，不做整体替换 —— 「加了一张图」不该显示成「删了三张又加了四张」 */
const AttachmentsChange = ({ before, after }: { before: TRequirementValue | undefined; after: TRequirementValue | undefined }) => {
  const { t } = useTranslation();
  const oldAssets = (Array.isArray(before) ? before : []) as TRequirementAssetRef[];
  const newAssets = (Array.isArray(after) ? after : []) as TRequirementAssetRef[];
  const oldIds = new Set(oldAssets.map((asset) => asset.asset_id));
  const newIds = new Set(newAssets.map((asset) => asset.asset_id));
  const added = newAssets.filter((asset) => !oldIds.has(asset.asset_id));
  const removed = oldAssets.filter((asset) => !newIds.has(asset.asset_id));
  return (
    <>
      {added.map((asset) => (
        <AttachmentChip key={`added-${asset.asset_id}`} asset={asset} tone="new" />
      ))}
      {added.length > 0 && (
        <span className="text-caption-md-regular text-placeholder">{t("requirement_detail.history.diff.added")}</span>
      )}
      {removed.map((asset) => (
        <AttachmentChip key={`removed-${asset.asset_id}`} asset={asset} tone="old" />
      ))}
      {removed.length > 0 && (
        <span className="text-caption-md-regular text-placeholder">{t("requirement_detail.history.diff.removed")}</span>
      )}
    </>
  );
};

const DiffRow = ({ row, mode, workspaceSlug }: { row: TSnapshotDiffRow; mode: TSnapshotDiffMode; workspaceSlug: string }) => {
  const { t } = useTranslation();
  let content: ReactNode;
  if (row.kind === "form") {
    content = (
      <span className="text-body-xs-regular text-tertiary">
        {t("requirement_detail.history.diff.subform_changed", { name: row.label })}
      </span>
    );
  } else if (row.kind === "attachments") {
    content = <AttachmentsChange before={row.before} after={row.after} />;
  } else if (mode === "create") {
    content = <SideValue row={row} value={row.after} tone="new" workspaceSlug={workspaceSlug} />;
  } else if (mode === "delete") {
    content = <SideValue row={row} value={row.before} tone="old" workspaceSlug={workspaceSlug} />;
  } else if (row.isRichText) {
    content = (
      <InlineTextDiff
        before={row.before as string | null | undefined}
        after={row.after as string | null | undefined}
        isHtml
        formatOnlyLabel={t("requirement_detail.history.diff.format_only")}
      />
    );
  } else {
    content = (
      <>
        <SideValue row={row} value={row.before} tone="old" workspaceSlug={workspaceSlug} />
        <ArrowRight className="size-3.5 shrink-0 text-placeholder" />
        <SideValue row={row} value={row.after} tone="new" workspaceSlug={workspaceSlug} />
      </>
    );
  }
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-t border-subtle py-1.5 first:border-t-0">
      <dt className="truncate text-caption-md-regular leading-[22px] text-tertiary" title={row.label}>
        {row.label}
      </dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 leading-[22px]">{content}</dd>
    </div>
  );
};

export const RequirementHistoryDiffPanel = ({
  diff,
  workspaceSlug,
  limit = DEFAULT_LIMIT,
  footerLeft,
  canShowFull = false,
  isFullOpen = false,
  onToggleFull,
  className,
}: {
  diff: TSnapshotDiff;
  workspaceSlug: string;
  limit?: number;
  /** 脚注左侧的说明，如「相对 v1」 */
  footerLeft?: ReactNode;
  canShowFull?: boolean;
  isFullOpen?: boolean;
  onToggleFull?: () => void;
  className?: string;
}) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? diff.rows : diff.rows.slice(0, limit);
  const hidden = diff.rows.length - rows.length;
  const canCollapse = showAll && diff.rows.length > limit;
  const hasFooter = hidden > 0 || canCollapse || Boolean(footerLeft) || canShowFull;

  return (
    <dl className={cn("m-0 flex flex-col rounded-lg border border-subtle bg-surface-2 px-3 py-1", className)}>
      {diff.mode === "unavailable" ? (
        <div className="py-1.5 text-body-xs-regular text-tertiary">{t("requirement_detail.history.diff.unavailable")}</div>
      ) : (
        rows.map((row) => <DiffRow key={row.key} row={row} mode={diff.mode} workspaceSlug={workspaceSlug} />)
      )}
      {hasFooter && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle py-1.5 text-caption-md-regular text-tertiary">
          <div className="flex flex-wrap items-center gap-3">
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="inline-flex items-center gap-0.5 transition-colors hover:text-secondary"
              >
                {t("requirement_detail.history.diff.more", { count: hidden })}
                <ChevronDown className="size-3" />
              </button>
            )}
            {canCollapse && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="inline-flex items-center gap-0.5 transition-colors hover:text-secondary"
              >
                {t("requirement_detail.history.diff.less")}
                <ChevronUp className="size-3" />
              </button>
            )}
            {footerLeft && <span className="text-placeholder">{footerLeft}</span>}
          </div>
          {canShowFull && (
            <button
              type="button"
              onClick={onToggleFull}
              className={cn(
                "inline-flex items-center gap-1 transition-colors",
                isFullOpen ? "text-accent-primary" : "hover:text-accent-primary"
              )}
            >
              <GitCompareArrows className="size-3" />
              {t(isFullOpen ? "requirement_detail.history.diff.hide_full" : "requirement_detail.history.diff.full")}
            </button>
          )}
        </div>
      )}
    </dl>
  );
};
