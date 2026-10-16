/**
 * 基线列表。
 *
 * 每份基线是一个不可变命名快照，所以这里没有「编辑」——只有打开、对比、改名、删除。
 * 「对比」选中两份后才可用，选择态放在本组件里，不进 URL：它是一次性的操作意图。
 * 「创建基线」入口在本列表工具栏；空列表时由空状态的 CTA 承接。
 */
import { useState } from "react";
import { GitCompareArrows, Layers, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import type { TRequirementBaseline } from "@plane/types";
import { Avatar, CustomMenu, Loader } from "@plane/ui";
import { getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
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
            <Loader.Item key={index} height="56px" />
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

  const showToolbar = canManage || selected.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showToolbar && (
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-subtle px-6">
          {selected.length > 0 && (
            <>
              <span className="text-13 text-secondary">
                {t("workspace_products.requirements.baseline.selected_count", { count: selected.length })}
              </span>
              {/* 对比只在两份之间发生：选满两份才可点 */}
              <button
                type="button"
                disabled={selected.length !== 2}
                onClick={() => onCompare(selected[0], selected[1])}
                title={
                  selected.length === 2 ? undefined : t("workspace_products.requirements.baseline.compare.need_two")
                }
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-accent-subtle bg-accent-subtle px-3 text-13 font-medium whitespace-nowrap text-accent-primary transition-colors hover:bg-accent-subtle-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GitCompareArrows className="size-4" />
                {t("workspace_products.requirements.baseline.compare.compare_selected")}
              </button>
            </>
          )}
          {canManage && onCreate && (
            <Button variant="primary" size="xl" className="ml-auto" prependIcon={<Plus />} onClick={onCreate}>
              {t("workspace_products.requirements.baseline.create")}
            </Button>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-surface-2 text-13 font-medium text-tertiary">
            <tr className="h-10 border-b border-subtle">
              <th className="w-11 pr-2 pl-5" aria-label={t("workspace_products.requirements.baseline.compare.action")} />
              <th className="min-w-72 px-4 font-medium">{t("workspace_products.requirements.baseline.columns.name")}</th>
              <th className="w-48 px-4 font-medium">{t("workspace_products.requirements.baseline.columns.entries")}</th>
              <th className="w-40 px-4 font-medium">{t("workspace_products.requirements.baseline.columns.creator")}</th>
              <th className="w-36 px-4 font-medium">
                {t("workspace_products.requirements.baseline.columns.created_at")}
              </th>
              {canManage && <th className="w-14 pr-4 pl-2" />}
            </tr>
          </thead>
          <tbody>
            {baselines.map((baseline) => {
              const isSelected = selected.includes(baseline.id);
              return (
                <tr
                  key={baseline.id}
                  className={`h-[68px] border-b border-subtle text-14 text-primary transition-colors ${
                    isSelected ? "bg-accent-subtle/50" : "hover:bg-layer-transparent-hover"
                  }`}
                >
                  <td className="pr-2 pl-5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(baseline.id)}
                      aria-label={baseline.name}
                      className="size-4 cursor-pointer accent-accent-primary"
                    />
                  </td>
                  <td className="px-4">
                    <button
                      type="button"
                      onClick={() => onOpen(baseline)}
                      className="flex w-full min-w-0 items-center gap-3 text-left"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
                        <Layers className="size-4" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-[3px]">
                        <span className="truncate text-14 font-semibold text-primary">{baseline.name}</span>
                        {baseline.description && (
                          <span className="truncate text-12 text-tertiary">{baseline.description}</span>
                        )}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 text-13 text-secondary tabular-nums">
                    {t("workspace_products.requirements.baseline.entry_count", { count: baseline.entry_count })}
                  </td>
                  <td className="px-4">
                    <span className="flex min-w-0 items-center gap-2 text-13 text-secondary">
                      <Avatar
                        size={22}
                        name={baseline.created_by_detail?.display_name ?? ""}
                        src={getFileURL(baseline.created_by_detail?.avatar_url ?? "")}
                      />
                      <span className="truncate">{baseline.created_by_detail?.display_name}</span>
                    </span>
                  </td>
                  <td className="px-4 text-13 text-tertiary tabular-nums">
                    {`${renderFormattedDate(baseline.created_at, "MM-dd")} ${renderFormattedTime(baseline.created_at)}`}
                  </td>
                  {canManage && (
                    <td className="pr-4 pl-2">
                      <CustomMenu
                        ellipsis
                        closeOnSelect
                        placement="bottom-end"
                        optionsClassName="p-1.5"
                        ariaLabel={t("workspace_products.requirements.baseline.more_actions")}
                      >
                        <CustomMenu.MenuItem onClick={() => onDelete(baseline)}>
                          <span className="flex items-center gap-2 text-13 text-danger-primary">
                            <Trash2 className="size-3.5 shrink-0" />
                            {t("workspace_products.requirements.baseline.delete")}
                          </span>
                        </CustomMenu.MenuItem>
                      </CustomMenu>
                    </td>
                  )}
                </tr>
              );
            })}
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
