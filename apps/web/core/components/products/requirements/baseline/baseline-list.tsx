/**
 * 基线列表。
 *
 * 每份基线是一个不可变命名快照，所以这里没有「编辑」——只有打开、对比、改名、删除。
 * 「对比」选中两份后才可用，选择态放在本组件里，不进 URL：它是一次性的操作意图。
 */
import { useState } from "react";
import { GitCompareArrows, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import type { TRequirementBaseline } from "@plane/types";
import { Avatar, Loader } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { BaselinePagination } from "./baseline-pagination";

type TProps = {
  baselines: TRequirementBaseline[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  canManage: boolean;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
  onRetry: () => void;
  onOpen: (baseline: TRequirementBaseline) => void;
  onCompare: (fromId: string, toId: string) => void;
  onDelete: (baseline: TRequirementBaseline) => void;
  onCreate?: () => void;
};

export function BaselineList(props: TProps) {
  const {
    baselines,
    totalCount,
    isLoading,
    error,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    canManage,
    onPerPageChange,
    onCursorChange,
    onRetry,
    onOpen,
    onCompare,
    onDelete,
    onCreate,
  } = props;
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (baselineId: string) =>
    setSelected((current) => {
      if (current.includes(baselineId)) return current.filter((item) => item !== baselineId);
      // 对比只在两份之间发生，选第三份时挤掉最早的那份
      return [...current, baselineId].slice(-2);
    });

  if (isLoading) {
    return (
      <div className="p-4">
        <Loader className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Loader.Item key={index} height="48px" />
          ))}
        </Loader>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-13 font-medium text-primary">
            {t("workspace_products.requirements.baseline.error_title")}
          </p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={onRetry}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!baselines.length) {
    return (
      <EmptyStateDetailed
        assetKey="view"
        title={t("workspace_products.requirements.baseline.empty.title")}
        description={t("workspace_products.requirements.baseline.empty.description")}
        actions={
          canManage && onCreate
            ? [
                {
                  label: t("workspace_products.requirements.baseline.empty.cta"),
                  onClick: onCreate,
                  variant: "primary",
                },
              ]
            : undefined
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selected.length === 2 && (
        <div className="flex shrink-0 items-center justify-between border-b border-subtle bg-accent-subtle/30 px-4 py-2">
          <span className="text-12 text-secondary">
            {t("workspace_products.requirements.baseline.compare.selected")}
          </span>
          <Button variant="primary" size="sm" onClick={() => onCompare(selected[0], selected[1])}>
            <GitCompareArrows className="size-3.5" />
            {t("workspace_products.requirements.baseline.compare.action")}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-layer-1 text-11 font-medium text-secondary">
            <tr className="border-b border-subtle">
              <th className="w-10 px-4 py-2.5" aria-label={t("workspace_products.requirements.baseline.compare.action")} />
              <th className="min-w-64 px-3 py-2.5">
                {t("workspace_products.requirements.baseline.columns.name")}
              </th>
              <th className="w-28 px-3 py-2.5">
                {t("workspace_products.requirements.baseline.columns.entries")}
              </th>
              <th className="w-44 px-3 py-2.5">
                {t("workspace_products.requirements.baseline.columns.creator")}
              </th>
              <th className="w-32 px-3 py-2.5">
                {t("workspace_products.requirements.baseline.columns.created_at")}
              </th>
              {canManage && <th className="w-14 px-3 py-2.5" />}
            </tr>
          </thead>
          <tbody>
            {baselines.map((baseline) => (
              <tr key={baseline.id} className="border-b border-subtle/70 text-12 hover:bg-accent-subtle/20">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(baseline.id)}
                    onChange={() => toggle(baseline.id)}
                    aria-label={baseline.name}
                    className="size-3.5 cursor-pointer accent-accent-primary"
                  />
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onOpen(baseline)}
                    className="flex max-w-full min-w-0 flex-col items-start text-left"
                  >
                    <span className="truncate font-medium text-accent-primary">{baseline.name}</span>
                    {baseline.description && (
                      <span className="mt-0.5 truncate text-11 text-tertiary">{baseline.description}</span>
                    )}
                  </button>
                </td>
                <td className="px-3 py-3 text-secondary tabular-nums">
                  {t("workspace_products.requirements.baseline.entry_count", { count: baseline.entry_count })}
                </td>
                <td className="px-3 py-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar
                      size="sm"
                      name={baseline.created_by_detail?.display_name ?? ""}
                      src={getFileURL(baseline.created_by_detail?.avatar_url ?? "")}
                    />
                    <span className="truncate">{baseline.created_by_detail?.display_name}</span>
                  </span>
                </td>
                <td className="px-3 py-3 text-11 text-tertiary">
                  {`${renderFormattedDate(baseline.created_at, "MM-dd")} ${renderFormattedTime(baseline.created_at)}`}
                </td>
                {canManage && (
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onDelete(baseline)}
                      className={cn(
                        "grid size-6 place-items-center rounded text-tertiary transition-colors",
                        "hover:bg-danger-subtle hover:text-danger-primary"
                      )}
                      aria-label={t("workspace_products.requirements.baseline.delete")}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BaselinePagination
        label={t("workspace_products.requirements.baseline.total", { count: totalCount })}
        perPage={perPage}
        nextCursor={nextCursor}
        prevCursor={prevCursor}
        nextPageResults={nextPageResults}
        prevPageResults={prevPageResults}
        onPerPageChange={onPerPageChange}
        onCursorChange={onCursorChange}
      />
    </div>
  );
}
