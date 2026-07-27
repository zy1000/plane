/**
 * 「版本历史」Tab：左栏版本时间线，右栏选中版本的只读快照。
 *
 * 回滚不直接改正式表 —— 它把历史快照灌入工作副本，需求回到草稿态，仍要再走一次审批。
 */
import { useMemo, useState } from "react";
import { isEqual } from "lodash-es";
import { ArrowLeftRight, RotateCcw, Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirement,
  TRequirementChangeItem,
  TRequirementDetailChangeSnapshot,
  TRequirementField,
} from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { useRequirementVersions } from "@/hooks/store/use-requirement-versions";
import { DetailDiffGrid } from "./detail-diff-grid";
import { PILL_BASE } from "./styles";
import { useChangeItemFilters } from "./use-change-item-filters";
import { VersionSnapshotPreview } from "./version-snapshot-preview";

/**
 * 把「选中版本 → 当前版本」这一页的行拼成变更项，喂给 detail-diff-grid。
 *
 * 两侧都是同一分页端点的同一页，所以只在页内按行 id 做并集对齐 —— 上千行时不需要把
 * 整份快照拉到前端。
 */
const buildComparisonItems = (
  before: TRequirementDetailChangeSnapshot[],
  after: TRequirementDetailChangeSnapshot[]
): TRequirementChangeItem[] => {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  const afterIds = new Set(after.map((row) => row.id));
  const toItem = (
    id: string,
    changeType: TRequirementChangeItem["change_type"],
    beforeRow: TRequirementDetailChangeSnapshot | null,
    afterRow: TRequirementDetailChangeSnapshot | null
  ): TRequirementChangeItem => ({
    id,
    target_kind: "detail_data",
    change_type: changeType,
    target_id: id,
    before_snapshot: beforeRow,
    proposed_snapshot: afterRow,
    base_version: null,
    proposed_sort_order: afterRow?.sort_order ?? beforeRow?.sort_order ?? null,
  });

  const items = after.flatMap((row) => {
    const previous = beforeById.get(row.id);
    if (!previous) return [toItem(row.id, "create", null, row)];
    if (isEqual(previous.data, row.data)) return [];
    return [toItem(row.id, "update", previous, row)];
  });
  before.forEach((row) => {
    if (afterIds.has(row.id)) return;
    items.push(toItem(row.id, "delete", row, null));
  });
  return items;
};

type TProps = {
  workspaceSlug: string;
  requirement: TRequirement;
  /** 当前发布内容的字段定义，「与当前对比」时用它作为列集合 */
  currentFields: TRequirementField[];
  onRequirementUpdate: (requirement: TRequirement) => void;
};

export function VersionHistory({ workspaceSlug, requirement, currentFields, onRequirementUpdate }: TProps) {
  const { t } = useTranslation();
  const store = useRequirementVersions({
    workspaceSlug,
    requirementId: requirement.id,
    onRequirementUpdate,
  });
  const { changeType, changedColumnsOnly, setChangeType, setChangedColumnsOnly } = useChangeItemFilters();
  const [pendingRollback, setPendingRollback] = useState<number | null>(null);

  const versions = store.versionsPage.results;
  const selectedVersion = store.selectedVersion;
  const isCurrentVersion = selectedVersion !== null && selectedVersion === requirement.current_version;
  const isComparing = store.compareVersion !== null;
  const snapshotFields = store.versionDetail?.fields_snapshot ?? [];
  const comparisonItems = useMemo(
    () =>
      isComparing ? buildComparisonItems(store.detailsPage.results, store.comparePage.results) : [],
    [isComparing, store.comparePage.results, store.detailsPage.results]
  );
  const filteredComparisonItems = useMemo(
    () => (changeType ? comparisonItems.filter((item) => item.change_type === changeType) : comparisonItems),
    [changeType, comparisonItems]
  );
  const comparisonChangedFieldIds = useMemo(() => {
    const ids = new Set<string>();
    comparisonItems.forEach((item) => {
      const before = (item.before_snapshot as TRequirementDetailChangeSnapshot | null)?.data ?? {};
      const after = (item.proposed_snapshot as TRequirementDetailChangeSnapshot | null)?.data ?? {};
      currentFields.forEach((field) => {
        if (!isEqual(before[field.id], after[field.id])) ids.add(field.id);
      });
    });
    return [...ids];
  }, [comparisonItems, currentFields]);

  const rollback = async (version: number) => {
    try {
      await store.rollbackToVersion(version);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.version.toast.rolled_back"),
      });
    } catch (error) {
      const payload = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_products.requirements.version.toast.failed"),
      });
    } finally {
      setPendingRollback(null);
    }
  };

  if (store.isLoading && !versions.length) {
    return (
      <div className="p-4 md:p-6">
        <Loader className="space-y-3">
          <Loader.Item height="420px" />
        </Loader>
      </div>
    );
  }

  if (store.error && !versions.length) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-13 font-medium text-primary">
            {t("workspace_products.requirements.version.error_title")}
          </p>
          <p className="mt-1 text-12 text-secondary">{store.error}</p>
          <Button className="mt-3" variant="secondary" onClick={() => void store.fetchVersions().catch(() => undefined)}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (!versions.length) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center text-13 text-tertiary">
        {t("workspace_products.requirements.version.empty")}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,30%)_1fr]">
        <aside className="flex flex-col rounded-lg border border-subtle">
          <header className="border-b border-subtle px-4 py-3 text-11 font-semibold text-secondary">
            {t("workspace_products.requirements.version.panel_title")}
          </header>
          <ol className="relative flex-1 space-y-2 px-4 py-4">
            <span aria-hidden className="absolute top-6 bottom-6 left-[1.4rem] w-px bg-subtle" />
            {versions.map((version) => {
              const isSelected = version.version === selectedVersion;
              const isCurrent = version.version === requirement.current_version;
              return (
                <li key={version.id} className="relative flex gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "relative z-[1] mt-3 size-2.5 shrink-0 rounded-full border-2 border-accent-primary",
                      isCurrent ? "bg-accent-primary" : "bg-surface-1"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => store.selectVersion(version.version)}
                    className={cn(
                      "min-w-0 flex-1 rounded-md border-l-[3px] px-3 py-2 text-left transition-colors",
                      isSelected
                        ? "border-accent-primary bg-accent-subtle"
                        : "border-transparent hover:bg-layer-transparent-hover"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-14 font-semibold text-primary">v{version.version}</span>
                      {isCurrent && (
                        <span className={cn(PILL_BASE, "bg-accent-subtle text-accent-primary")}>
                          {t("workspace_products.requirements.version.current")}
                        </span>
                      )}
                    </span>
                    <p className="mt-0.5 text-11 text-secondary">
                      {t("workspace_products.requirements.version.meta", {
                        time: renderFormattedDate(version.created_at, "MM-dd HH:mm"),
                        name: version.created_by_detail?.display_name ?? "",
                      })}
                    </p>
                    <p className="mt-0.5 text-11 text-tertiary">
                      {version.change_request_sequence_id
                        ? t("workspace_products.requirements.version.source", {
                            sequence: `CR-${version.change_request_sequence_id}`,
                          })
                        : t("workspace_products.requirements.version.initial_publish")}
                    </p>
                  </button>
                </li>
              );
            })}
          </ol>
          <footer className="border-t border-subtle px-4 py-3 text-11 text-secondary">
            {t("workspace_products.requirements.version.total", { count: store.versionsPage.total_count ?? 0 })}
          </footer>
        </aside>

        <section className="flex min-w-0 flex-col rounded-lg border border-subtle">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-3">
            <h2 className="text-14 font-semibold text-primary">
              {t("workspace_products.requirements.version.snapshot_title", { version: selectedVersion ?? "" })}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                variant={isComparing ? "primary" : "secondary"}
                size="sm"
                disabled={isCurrentVersion || requirement.current_version === null}
                onClick={() => store.setCompareVersion(isComparing ? null : requirement.current_version)}
              >
                <ArrowLeftRight className="size-3.5" />
                {t("workspace_products.requirements.version.compare_current")}
              </Button>
              {requirement.can_edit && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={store.isMutating}
                  onClick={() => selectedVersion !== null && setPendingRollback(selectedVersion)}
                >
                  <RotateCcw className="size-3.5" />
                  {t("workspace_products.requirements.version.rollback")}
                </Button>
              )}
            </div>
          </header>

          <div className="flex items-center gap-2 border-b border-subtle bg-layer-2 px-4 py-2.5 text-12 text-secondary">
            <Info className="size-3.5 shrink-0" />
            {t("workspace_products.requirements.version.rollback_hint")}
          </div>

          <div className="flex items-center justify-end px-4 py-2">
            <span className={cn(PILL_BASE, "bg-layer-2 text-secondary")}>
              {isComparing
                ? t("workspace_products.requirements.version.comparing", {
                    from: `v${selectedVersion ?? ""}`,
                    to: `v${requirement.current_version ?? ""}`,
                  })
                : t("workspace_products.requirements.version.read_only")}
            </span>
          </div>

          {store.isVersionLoading && !store.versionDetail ? (
            <div className="p-4">
              <Loader className="space-y-2">
                <Loader.Item height="280px" />
              </Loader>
            </div>
          ) : isComparing ? (
            <DetailDiffGrid
              workspaceSlug={workspaceSlug}
              fields={currentFields}
              changedFieldIds={comparisonChangedFieldIds}
              items={filteredComparisonItems}
              totalCount={store.detailsPage.total_count ?? 0}
              isLoading={store.isDetailsLoading}
              error={store.detailsError}
              perPage={store.detailsPerPage}
              nextCursor={store.detailsPage.next_cursor}
              prevCursor={store.detailsPage.prev_cursor}
              nextPageResults={store.detailsPage.next_page_results}
              prevPageResults={store.detailsPage.prev_page_results}
              changeType={changeType}
              changedColumnsOnly={changedColumnsOnly}
              onChangeTypeChange={setChangeType}
              onChangedColumnsOnlyChange={setChangedColumnsOnly}
              onPerPageChange={store.setDetailsPerPage}
              onCursorChange={store.setDetailsCursor}
            />
          ) : (
            <VersionSnapshotPreview
              workspaceSlug={workspaceSlug}
              fields={snapshotFields}
              rows={store.detailsPage.results}
              totalCount={store.detailsPage.total_count ?? 0}
              isLoading={store.isDetailsLoading}
              error={store.detailsError}
              perPage={store.detailsPerPage}
              nextCursor={store.detailsPage.next_cursor}
              prevCursor={store.detailsPage.prev_cursor}
              nextPageResults={store.detailsPage.next_page_results}
              prevPageResults={store.detailsPage.prev_page_results}
              onPerPageChange={store.setDetailsPerPage}
              onCursorChange={store.setDetailsCursor}
            />
          )}
        </section>
      </div>

      <AlertModalCore
        isOpen={pendingRollback !== null}
        isSubmitting={store.isMutating}
        variant="warning"
        handleClose={() => setPendingRollback(null)}
        handleSubmit={() => pendingRollback !== null && void rollback(pendingRollback)}
        title={t("workspace_products.requirements.version.rollback_title", { version: pendingRollback ?? "" })}
        content={t("workspace_products.requirements.version.rollback_description", {
          version: pendingRollback ?? "",
        })}
      />
    </div>
  );
}
