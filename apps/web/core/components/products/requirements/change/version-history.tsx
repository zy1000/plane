/**
 * 「版本历史」Tab：左栏版本时间线，右栏选中版本的只读快照。
 *
 * 回滚不直接改正式表 —— 它把历史快照灌入工作副本，需求回到草稿态，仍要再走一次审批。
 */
import { useState, type KeyboardEvent } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, GitBranch, Info, RotateCcw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IUserLite, TRequirement } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { useRequirementVersions } from "@/hooks/store/use-requirement-versions";
import { MetaDiffTable, SchemaDiffList } from "./change-diff-groups";
import { DetailDiffGrid } from "./detail-diff-grid";
import { PILL_BASE } from "./styles";
import { useChangeItemFilters } from "./use-change-item-filters";
import { VersionSnapshotOverview } from "./version-snapshot-overview";

const COMPARISON_SECTIONS = ["basic", "schema", "detail"] as const;
type TComparisonSection = (typeof COMPARISON_SECTIONS)[number];
type TComparisonSelection = {
  comparisonKey: string;
  section: TComparisonSection;
};

type TProps = {
  workspaceSlug: string;
  requirement: TRequirement;
  members: IUserLite[];
  onRequirementUpdate: (requirement: TRequirement) => void;
};

export function VersionHistory({ workspaceSlug, requirement, members, onRequirementUpdate }: TProps) {
  const { t } = useTranslation();
  const { changeType, changedColumnsOnly, setChangeType, setChangedColumnsOnly } = useChangeItemFilters();
  const store = useRequirementVersions({
    workspaceSlug,
    requirementId: requirement.id,
    currentVersion: requirement.current_version,
    changeType,
    onRequirementUpdate,
  });
  const [pendingRollback, setPendingRollback] = useState<number | null>(null);
  const [comparisonSelection, setComparisonSelection] = useState<TComparisonSelection | null>(null);

  const versions = store.versionsPage.results;
  const selectedVersion = store.selectedVersion;
  const selectedVersionItem =
    store.versionDetail ?? versions.find((version) => version.version === selectedVersion) ?? null;
  const isCurrentVersion = selectedVersion !== null && selectedVersion === requirement.current_version;
  const isComparing = store.compareVersion !== null;
  const isRollbackBlocked = requirement.status === "in_review";
  const snapshotFields = store.versionDetail?.fields_snapshot ?? [];
  const snapshotFieldCount = snapshotFields.reduce((count, field) => count + 1 + field.children.length, 0);
  const comparison = store.comparisonPage;
  const comparisonSectionCounts: Record<TComparisonSection, number> = {
    basic: comparison?.requirement_items.length ?? 0,
    schema: comparison?.schema_items.length ?? 0,
    detail: comparison?.detail_item_count ?? 0,
  };
  const comparisonKey = `${selectedVersion ?? ""}:${comparison?.to_version ?? requirement.current_version ?? ""}`;
  const defaultComparisonSection =
    COMPARISON_SECTIONS.find((section) => comparisonSectionCounts[section] > 0) ?? "basic";
  const activeComparisonSection =
    comparisonSelection?.comparisonKey === comparisonKey ? comparisonSelection.section : defaultComparisonSection;
  const selectComparisonSection = (section: TComparisonSection) =>
    setComparisonSelection({
      comparisonKey,
      section,
    });
  const handleComparisonSectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, section: TComparisonSection) => {
    const currentIndex = COMPARISON_SECTIONS.indexOf(section);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % COMPARISON_SECTIONS.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + COMPARISON_SECTIONS.length) % COMPARISON_SECTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? COMPARISON_SECTIONS.length - 1
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = COMPARISON_SECTIONS[nextIndex];
    selectComparisonSection(nextSection);
    document.getElementById(`version-compare-tab-${nextSection}`)?.focus();
  };

  const rollback = async (version: number) => {
    if (isRollbackBlocked) {
      setPendingRollback(null);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.requirements.version.rollback_in_review"),
      });
      return;
    }
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
          <p className="text-13 font-medium text-primary">{t("workspace_products.requirements.version.error_title")}</p>
          <p className="mt-1 text-12 text-secondary">{store.error}</p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => void store.fetchVersions().catch(() => undefined)}
          >
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-layer-1 p-3 lg:overflow-hidden lg:p-4">
      <div className="grid min-h-full gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1 lg:max-h-none">
          <header className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-12 font-semibold text-primary">
              <GitBranch className="size-4 text-secondary" />
              {t("workspace_products.requirements.version.panel_title")}
            </span>
            <span className={cn(PILL_BASE, "bg-layer-2 text-secondary")}>
              {store.versionsPage.total_count ?? versions.length}
            </span>
          </header>
          <ol className="relative flex-1 space-y-1 overflow-y-auto px-3 py-3">
            <span aria-hidden className="bg-subtle absolute top-6 bottom-6 left-[1.4rem] w-px" />
            {versions.map((version) => {
              const isSelected = version.version === selectedVersion;
              const isCurrent = version.version === requirement.current_version;
              return (
                <li key={version.id} className="relative flex gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "relative z-[1] mt-3 size-2.5 shrink-0 rounded-full border-2",
                      isSelected
                        ? "border-accent-primary bg-accent-primary"
                        : isCurrent
                          ? "border-accent-primary bg-surface-1"
                          : "border-subtle bg-surface-1"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setComparisonSelection(null);
                      store.selectVersion(version.version);
                      if (version.version === requirement.current_version) store.setCompareVersion(null);
                    }}
                    className={cn(
                      "min-w-0 flex-1 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong",
                      isSelected
                        ? "border-accent-subtle bg-accent-subtle/70"
                        : "border-transparent hover:border-subtle hover:bg-layer-transparent-hover"
                    )}
                    aria-pressed={isSelected}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-14 font-semibold text-primary">v{version.version}</span>
                      {isCurrent && (
                        <span className={cn(PILL_BASE, "bg-accent-subtle text-accent-primary")}>
                          {t("workspace_products.requirements.version.current")}
                        </span>
                      )}
                    </span>
                    <p className="mt-1 text-11 text-secondary">
                      {t("workspace_products.requirements.version.meta", {
                        time: `${renderFormattedDate(version.created_at, "YYYY-MM-DD")} ${renderFormattedTime(version.created_at)}`,
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
          <footer className="flex items-center justify-between gap-2 border-t border-subtle px-3 py-2.5 text-11 text-secondary">
            <span>
              {t("workspace_products.requirements.version.total", { count: store.versionsPage.total_count ?? 0 })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!store.versionsPage.prev_page_results}
                onClick={() => store.setCursor(store.versionsPage.prev_cursor)}
                className="grid size-7 place-items-center rounded-md border border-subtle text-secondary transition-colors hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("workspace_templates.requirements.list.previous_page")}
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={!store.versionsPage.next_page_results}
                onClick={() => store.setCursor(store.versionsPage.next_cursor)}
                className="grid size-7 place-items-center rounded-md border border-subtle text-secondary transition-colors hover:bg-layer-transparent-hover disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={t("workspace_templates.requirements.list.next_page")}
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </footer>
        </aside>

        <section className="flex min-h-[38rem] min-w-0 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1 lg:min-h-0">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-subtle px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-14 font-semibold text-primary">
                  {t("workspace_products.requirements.version.snapshot_title", { version: selectedVersion ?? "" })}
                </h2>
                <span className={cn(PILL_BASE, "bg-layer-2 text-secondary")}>
                  {isComparing
                    ? t("workspace_products.requirements.version.comparing", {
                        from: `v${selectedVersion ?? ""}`,
                        to: `v${comparison?.to_version ?? requirement.current_version ?? ""}`,
                      })
                    : t("workspace_products.requirements.version.read_only")}
                </span>
              </div>
              {selectedVersionItem && (
                <p className="mt-1 text-11 text-secondary">
                  {t("workspace_products.requirements.version.meta", {
                    time: `${renderFormattedDate(selectedVersionItem.created_at, "YYYY-MM-DD")} ${renderFormattedTime(selectedVersionItem.created_at)}`,
                    name: selectedVersionItem.created_by_detail?.display_name ?? "",
                  })}
                  <span className="px-1.5 text-placeholder">·</span>
                  {selectedVersionItem.change_request_sequence_id
                    ? t("workspace_products.requirements.version.source", {
                        sequence: `CR-${selectedVersionItem.change_request_sequence_id}`,
                      })
                    : t("workspace_products.requirements.version.initial_publish")}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={isComparing ? "primary" : "secondary"}
                size="sm"
                disabled={isCurrentVersion || requirement.current_version === null}
                onClick={() => {
                  setComparisonSelection(null);
                  store.setCompareVersion(isComparing ? null : requirement.current_version);
                }}
              >
                <ArrowLeftRight className="size-3.5" />
                {t("workspace_products.requirements.version.compare_current")}
              </Button>
              {requirement.can_edit && (
                <Tooltip
                  tooltipContent={t("workspace_products.requirements.version.rollback_in_review")}
                  disabled={!isRollbackBlocked}
                >
                  <span>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={store.isMutating || isRollbackBlocked}
                      onClick={() => selectedVersion !== null && setPendingRollback(selectedVersion)}
                    >
                      <RotateCcw className="size-3.5" />
                      {t("workspace_products.requirements.version.rollback")}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </div>
          </header>

          <div className="flex items-center gap-2 border-b border-subtle bg-layer-2 px-4 py-2.5 text-12 text-secondary">
            <Info className="size-3.5 shrink-0" />
            {t(
              isRollbackBlocked
                ? "workspace_products.requirements.version.rollback_in_review"
                : "workspace_products.requirements.version.rollback_hint"
            )}
          </div>

          {isComparing ? (
            <div className="min-w-0 overflow-x-auto border-b border-subtle px-3">
              <div
                role="tablist"
                aria-label={t("workspace_products.requirements.version.comparison_views")}
                className="flex min-w-max"
              >
                {COMPARISON_SECTIONS.map((section) => {
                  const isActive = activeComparisonSection === section;
                  return (
                    <button
                      key={section}
                      id={`version-compare-tab-${section}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="version-compare-panel"
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => selectComparisonSection(section)}
                      onKeyDown={(event) => handleComparisonSectionKeyDown(event, section)}
                      className={cn(
                        "flex h-10 items-center gap-1.5 border-b-2 px-3 text-12 transition-colors focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none focus-visible:ring-inset",
                        isActive
                          ? "border-accent-strong font-medium text-accent-primary"
                          : "border-transparent text-secondary hover:text-primary"
                      )}
                    >
                      {t(`workspace_products.requirements.version.comparison_sections.${section}`)}
                      <span
                        className={cn(
                          "grid min-w-4 place-items-center rounded bg-layer-2 px-1 text-10 tabular-nums",
                          isActive ? "text-accent-primary" : "text-tertiary"
                        )}
                      >
                        {comparisonSectionCounts[section]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-subtle px-3">
              {[
                { href: "#version-overview", label: t("workspace_products.requirements.version.sections.overview") },
                { href: "#version-basic", label: t("workspace_products.requirements.version.sections.basic") },
                {
                  href: "#version-fields",
                  label: t("workspace_products.requirements.version.sections.fields_with_count", {
                    count: snapshotFieldCount,
                  }),
                },
                {
                  href: "#version-details",
                  label: t("workspace_products.requirements.version.sections.details_with_count", {
                    count: store.versionDetail?.detail_count ?? 0,
                  }),
                },
              ].map((item, index) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex h-10 shrink-0 items-center px-3 text-11 transition-colors hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-strong",
                    index === 0
                      ? "font-medium text-accent-primary after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:bg-accent-primary"
                      : "text-secondary"
                  )}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          )}

          <div
            id={isComparing ? "version-compare-panel" : undefined}
            role={isComparing ? "tabpanel" : undefined}
            aria-labelledby={isComparing ? `version-compare-tab-${activeComparisonSection}` : undefined}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {isComparing ? (
              store.isComparisonLoading && !comparison ? (
                <div className="p-4">
                  <Loader className="space-y-3">
                    <Loader.Item height="48px" />
                    <Loader.Item height="260px" />
                  </Loader>
                </div>
              ) : store.comparisonError && !comparison ? (
                <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
                  <div>
                    <p className="text-13 font-medium text-primary">
                      {t("workspace_products.requirements.version.comparison_error")}
                    </p>
                    <p className="mt-1 text-12 text-secondary">{store.comparisonError}</p>
                    <Button
                      className="mt-3"
                      variant="secondary"
                      onClick={() => void store.fetchComparison().catch(() => undefined)}
                    >
                      {t("retry")}
                    </Button>
                  </div>
                </div>
              ) : comparison ? (
                activeComparisonSection === "basic" ? (
                  <div className="p-4 md:p-6">
                    <MetaDiffTable items={comparison.requirement_items} members={members} />
                  </div>
                ) : activeComparisonSection === "schema" ? (
                  <div className="p-4 md:p-6">
                    <SchemaDiffList items={comparison.schema_items} />
                  </div>
                ) : (
                  <DetailDiffGrid
                    workspaceSlug={workspaceSlug}
                    fields={comparison.to_fields_snapshot}
                    changedFieldIds={comparison.changed_field_ids}
                    items={comparison.results}
                    totalCount={comparison.total_count ?? 0}
                    isLoading={store.isComparisonLoading}
                    error={store.comparisonError}
                    perPage={store.comparisonPerPage}
                    nextCursor={comparison.next_cursor}
                    prevCursor={comparison.prev_cursor}
                    nextPageResults={comparison.next_page_results}
                    prevPageResults={comparison.prev_page_results}
                    changeType={changeType}
                    changedColumnsOnly={changedColumnsOnly}
                    onChangeTypeChange={(value) => {
                      store.setComparisonCursor(undefined);
                      setChangeType(value);
                    }}
                    onChangedColumnsOnlyChange={setChangedColumnsOnly}
                    onPerPageChange={store.setComparisonPerPage}
                    onCursorChange={store.setComparisonCursor}
                  />
                )
              ) : null
            ) : store.isVersionLoading && !store.versionDetail ? (
              <div className="p-4">
                <Loader className="space-y-3">
                  <Loader.Item height="180px" />
                  <Loader.Item height="260px" />
                </Loader>
              </div>
            ) : store.error && !store.versionDetail ? (
              <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
                <div>
                  <p className="text-13 font-medium text-primary">
                    {t("workspace_products.requirements.version.snapshot_error")}
                  </p>
                  <p className="mt-1 text-12 text-secondary">{store.error}</p>
                  <Button
                    className="mt-3"
                    variant="secondary"
                    onClick={() => void store.fetchVersionDetail().catch(() => undefined)}
                  >
                    {t("retry")}
                  </Button>
                </div>
              </div>
            ) : store.versionDetail ? (
              <VersionSnapshotOverview
                workspaceSlug={workspaceSlug}
                versionDetail={store.versionDetail}
                members={members}
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
            ) : null}
          </div>
        </section>
      </div>

      <AlertModalCore
        isOpen={pendingRollback !== null}
        isSubmitting={store.isMutating}
        variant="primary"
        handleClose={() => setPendingRollback(null)}
        handleSubmit={() => pendingRollback !== null && void rollback(pendingRollback)}
        title={t("workspace_products.requirements.version.rollback_title", { version: pendingRollback ?? "" })}
        content={t("workspace_products.requirements.version.rollback_description", {
          version: pendingRollback ?? "",
        })}
        primaryButtonText={{
          default: t("workspace_products.requirements.version.rollback_confirm"),
          loading: t("workspace_products.requirements.version.rollback_loading"),
        }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
}
