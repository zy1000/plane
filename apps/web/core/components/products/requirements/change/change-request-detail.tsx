/**
 * 变更对比页：整宽三视图审阅 + 底部审批条。
 *
 * 概览与字段定义直接消费详情响应中的内联快照，明细数据继续走独立分页端点。
 */
import { useState, type KeyboardEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementApprovalAction, TRequirementField, IUserLite } from "@plane/types";
import { AlertModalCore, Avatar, Loader } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { useRequirementChangeRequestDetail } from "@/hooks/store/use-requirement-changes";
import { ChangeApprovalBar } from "./change-approval-bar";
import { ChangeApprovalProgress } from "./change-approval-progress";
import { MetaDiffTable, SchemaDiffList } from "./change-diff-groups";
import { DetailDiffGrid } from "./detail-diff-grid";
import { approvalRuleLabel, CHANGE_STATUS_PILL, PILL_BASE } from "./styles";
import { useChangeItemFilters } from "./use-change-item-filters";

const REVIEW_SECTIONS = ["overview", "schema", "detail"] as const;
type TReviewSection = (typeof REVIEW_SECTIONS)[number];

type TProps = {
  workspaceSlug: string;
  requirementId: string;
  changeRequestId: string;
  fields: TRequirementField[];
  members: IUserLite[];
  onBack: () => void;
  /** 审批 / 撤回之后需求状态会变，通知外层刷新 */
  onSettled: () => void;
};

export function ChangeRequestDetail(props: TProps) {
  const { workspaceSlug, requirementId, changeRequestId, fields, members, onBack, onSettled } = props;
  const { t } = useTranslation();
  const { changeType, changedColumnsOnly, setChangeType, setChangedColumnsOnly } = useChangeItemFilters();
  const store = useRequirementChangeRequestDetail({ workspaceSlug, requirementId, changeRequestId, changeType });
  const { changeRequest } = store;
  const [activeSection, setActiveSection] = useState<TReviewSection>("detail");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const act = async (action: TRequirementApprovalAction, comment: string) => {
    try {
      await store.actOnChangeRequest(action, comment);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t(`workspace_products.requirements.change.toast.${action}`),
      });
      onSettled();
    } catch (error) {
      const payload = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_products.requirements.change.toast.failed"),
      });
    }
  };

  const withdraw = async () => {
    try {
      await store.cancelChangeRequest();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.requirements.change.toast.cancelled"),
      });
      onSettled();
    } catch (error) {
      const payload = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_products.requirements.change.toast.failed"),
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  if (store.isLoading && !changeRequest) {
    return (
      <div className="p-6">
        <Loader className="space-y-3">
          <Loader.Item height="112px" />
          <Loader.Item height="56px" />
          <Loader.Item height="112px" />
          <Loader.Item height="320px" />
        </Loader>
      </div>
    );
  }

  if (!changeRequest) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-13 font-medium text-primary">{t("workspace_products.requirements.change.error_title")}</p>
          {store.error && <p className="mt-1 text-12 text-secondary">{store.error}</p>}
          <Button className="mt-3" variant="secondary" onClick={onBack}>
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  const rule = approvalRuleLabel(t, changeRequest.approval_type, changeRequest.required_count);
  const ruleSummary = t("workspace_products.requirements.change.rule_summary", {
    rule,
    total: changeRequest.total_count,
    approved: changeRequest.approved_count,
  });
  const sectionCounts: Record<TReviewSection, number> = {
    overview: changeRequest.requirement_items.length,
    schema: changeRequest.schema_items.length,
    detail: changeRequest.detail_item_count,
  };
  const handleSectionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, section: TReviewSection) => {
    const currentIndex = REVIEW_SECTIONS.indexOf(section);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % REVIEW_SECTIONS.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + REVIEW_SECTIONS.length) % REVIEW_SECTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? REVIEW_SECTIONS.length - 1
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextSection = REVIEW_SECTIONS[nextIndex];
    setActiveSection(nextSection);
    document.getElementById(`change-review-tab-${nextSection}`)?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <header className="border-b border-subtle px-4 pt-2 md:px-6">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={onBack}
              aria-label={t("common.back")}
              className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <nav
                  aria-label={t("workspace_products.requirements.change.breadcrumb")}
                  className="flex min-w-0 items-center gap-1.5 text-12 text-secondary"
                >
                  <span className="truncate">{t("workspace_products.requirements.change.breadcrumb")}</span>
                  <span aria-hidden className="text-tertiary">
                    /
                  </span>
                  <span className="font-medium text-primary tabular-nums">CR-{changeRequest.sequence_id}</span>
                </nav>
                <span className={cn(PILL_BASE, CHANGE_STATUS_PILL[changeRequest.status])}>
                  {t(`workspace_products.requirements.change.statuses.${changeRequest.status}`)}
                </span>
              </div>
              <h1 className="mt-2 max-w-[65ch] text-18 leading-6 font-semibold break-words text-primary">
                {changeRequest.reason || t("workspace_products.requirements.change.untitled")}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 text-tertiary">
                <Avatar
                  size="sm"
                  name={changeRequest.created_by_detail?.display_name ?? ""}
                  src={getFileURL(changeRequest.created_by_detail?.avatar_url ?? "")}
                />
                {changeRequest.created_by_detail?.display_name && (
                  <span className="font-medium text-secondary">{changeRequest.created_by_detail.display_name}</span>
                )}
                <span aria-hidden>·</span>
                <span>
                  {t("workspace_products.requirements.change.meta_submitted", {
                    time: `${renderFormattedDate(changeRequest.created_at, "MM-dd")} ${renderFormattedTime(changeRequest.created_at)}`,
                  })}
                </span>
                {changeRequest.base_version !== null && (
                  <>
                    <span aria-hidden>·</span>
                    <span>
                      {t("workspace_products.requirements.change.meta_base_version", {
                        version: changeRequest.base_version,
                      })}
                    </span>
                  </>
                )}
              </div>

              <div className="mt-2 min-w-0 overflow-x-auto">
                <div
                  role="tablist"
                  aria-label={t("workspace_products.requirements.change.views.label")}
                  className="flex min-w-max"
                >
                  {REVIEW_SECTIONS.map((section) => {
                    const isActive = activeSection === section;
                    return (
                      <button
                        key={section}
                        id={`change-review-tab-${section}`}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls="change-review-panel"
                        tabIndex={isActive ? 0 : -1}
                        onClick={() => setActiveSection(section)}
                        onKeyDown={(event) => handleSectionKeyDown(event, section)}
                        className={cn(
                          "flex h-11 items-center gap-1.5 border-b-2 px-3 text-13 transition-colors focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none focus-visible:ring-inset",
                          isActive
                            ? "border-accent-strong font-medium text-accent-primary"
                            : "border-transparent text-secondary hover:text-primary"
                        )}
                      >
                        {t(`workspace_products.requirements.change.views.${section}`)}
                        <span
                          className={cn(
                            "grid min-w-4 place-items-center rounded bg-layer-2 px-1 text-10 tabular-nums",
                            isActive ? "text-accent-primary" : "text-tertiary"
                          )}
                        >
                          {sectionCounts[section]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 border-b border-subtle px-4 py-2 md:px-6 lg:flex-nowrap lg:py-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-13 lg:flex-nowrap">
            <span className="font-medium text-secondary tabular-nums">
              {t("workspace_products.requirements.change.summary.total_changes", {
                count: changeRequest.item_count,
              })}
            </span>
            <span aria-hidden className="hidden text-tertiary sm:inline">
              ·
            </span>
            <span className="font-medium text-success-primary tabular-nums">
              {t("workspace_products.requirements.change.summary.created", { count: changeRequest.created_count })}
            </span>
            <span className="font-medium text-warning-primary tabular-nums">
              {t("workspace_products.requirements.change.summary.updated", { count: changeRequest.updated_count })}
            </span>
            <span className="font-medium text-danger-primary tabular-nums">
              {t("workspace_products.requirements.change.summary.deleted", { count: changeRequest.deleted_count })}
            </span>
          </div>
          <div className="ml-auto">
            <ChangeApprovalProgress approvals={changeRequest.approvals} summary={ruleSummary} />
          </div>
        </div>

        <div
          id="change-review-panel"
          role="tabpanel"
          aria-labelledby={`change-review-tab-${activeSection}`}
          className={cn(activeSection !== "detail" && "px-4 py-4 md:px-6")}
        >
          {activeSection === "overview" ? (
            <MetaDiffTable items={changeRequest.requirement_items} members={members} />
          ) : activeSection === "schema" ? (
            <SchemaDiffList items={changeRequest.schema_items} />
          ) : (
            <DetailDiffGrid
              workspaceSlug={workspaceSlug}
              fields={fields}
              changedFieldIds={changeRequest.changed_field_ids}
              items={store.itemsPage.results}
              totalCount={store.itemsPage.total_count ?? 0}
              isLoading={store.isItemsLoading}
              error={store.itemsError}
              perPage={store.perPage}
              nextCursor={store.itemsPage.next_cursor}
              prevCursor={store.itemsPage.prev_cursor}
              nextPageResults={store.itemsPage.next_page_results}
              prevPageResults={store.itemsPage.prev_page_results}
              changeType={changeType}
              changedColumnsOnly={changedColumnsOnly}
              onChangeTypeChange={setChangeType}
              onChangedColumnsOnlyChange={setChangedColumnsOnly}
              onPerPageChange={store.setPerPage}
              onCursorChange={store.setCursor}
              density="comfortable"
            />
          )}
        </div>
      </div>

      <ChangeApprovalBar
        changeRequest={changeRequest}
        isMutating={store.isMutating}
        onApprove={(comment) => void act("approved", comment)}
        onReject={(comment) => void act("rejected", comment)}
        onWithdraw={() => setIsWithdrawing(true)}
      />

      <AlertModalCore
        isOpen={isWithdrawing}
        isSubmitting={store.isMutating}
        handleClose={() => setIsWithdrawing(false)}
        handleSubmit={() => void withdraw()}
        title={t("workspace_products.requirements.state.withdraw_review_title")}
        content={t("workspace_products.requirements.state.withdraw_review_description")}
      />
    </div>
  );
}
