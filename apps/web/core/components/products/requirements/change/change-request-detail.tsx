/**
 * 变更对比页：整宽单栏 + 底部固定审批条（不做右侧审批栏 —— 明细网格列多，右侧栏会抢宽度）。
 *
 * 「基本信息」与「字段定义」两组的变更项由详情响应内联，「明细数据」组走独立的分页
 * 端点，所以千行明细下这个页面的首屏请求量与十行时一致。
 */
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementApprovalAction, TRequirementField } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { useRequirementChangeRequestDetail } from "@/hooks/store/use-requirement-changes";
import { ChangeApprovalBar } from "./change-approval-bar";
import { ChangeApprovalProgress } from "./change-approval-progress";
import { DiffGroupCard, MetaDiffTable, SchemaDiffList } from "./change-diff-groups";
import { DetailDiffGrid } from "./detail-diff-grid";
import { approvalRuleLabel, CHANGE_STATUS_PILL, PILL_BASE } from "./styles";
import { useChangeItemFilters } from "./use-change-item-filters";

type TProps = {
  workspaceSlug: string;
  requirementId: string;
  changeRequestId: string;
  fields: TRequirementField[];
  onBack: () => void;
  /** 审批 / 撤回之后需求状态会变，通知外层刷新 */
  onSettled: () => void;
};

export function ChangeRequestDetail(props: TProps) {
  const { workspaceSlug, requirementId, changeRequestId, fields, onBack, onSettled } = props;
  const { t } = useTranslation();
  const { changeType, changedColumnsOnly, setChangeType, setChangedColumnsOnly } = useChangeItemFilters();
  const store = useRequirementChangeRequestDetail({ workspaceSlug, requirementId, changeRequestId, changeType });
  const { changeRequest } = store;
  const [openGroups, setOpenGroups] = useState({ approval: true, requirement: true, schema: true, detail: true });
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const toggleGroup = (key: keyof typeof openGroups) =>
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));

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
          <Loader.Item height="80px" />
          <Loader.Item height="160px" />
          <Loader.Item height="320px" />
        </Loader>
      </div>
    );
  }

  if (!changeRequest) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-16 text-center">
        <div>
          <p className="text-13 font-medium text-primary">
            {t("workspace_products.requirements.change.error_title")}
          </p>
          {store.error && <p className="mt-1 text-12 text-secondary">{store.error}</p>}
          <Button className="mt-3" variant="secondary" onClick={onBack}>
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 px-4 py-3 md:px-6">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover hover:text-primary"
          >
            <ArrowLeft className="size-4" />
          </button>
          <nav className="flex min-w-0 items-center gap-1.5 text-12 text-secondary">
            <span className="truncate">{changeRequest.requirement_title}</span>
            <span className="text-tertiary">/</span>
            <span>{t("workspace_products.requirements.change.breadcrumb")}</span>
            <span className="text-tertiary">/</span>
            <span className="font-medium text-primary">CR-{changeRequest.sequence_id}</span>
          </nav>
          <span className={cn(PILL_BASE, CHANGE_STATUS_PILL[changeRequest.status], "ml-auto")}>
            {t(`workspace_products.requirements.change.statuses.${changeRequest.status}`)}
          </span>
        </div>

        <div className="px-4 md:px-6">
          <h1 className="text-18 font-semibold text-primary">
            {changeRequest.reason || t("workspace_products.requirements.change.untitled")}
          </h1>
          <p className="mt-1 text-12 text-secondary">
            <span className="text-primary">{changeRequest.created_by_detail?.display_name}</span>
            {"  "}
            {t("workspace_products.requirements.change.meta_submitted", {
              time: renderFormattedDate(changeRequest.created_at, "MM-dd HH:mm"),
            })}
            {changeRequest.base_version !== null && (
              <>
                {" · "}
                {t("workspace_products.requirements.change.meta_base_version", {
                  version: changeRequest.base_version,
                })}
              </>
            )}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-subtle bg-layer-1 px-4 py-2.5 md:px-6">
          <div className="flex items-center gap-2">
            <span className={cn(PILL_BASE, "bg-success-subtle text-success-primary")}>
              {t("workspace_products.requirements.change.summary.created", { count: changeRequest.created_count })}
            </span>
            <span className={cn(PILL_BASE, "bg-warning-subtle text-warning-primary")}>
              {t("workspace_products.requirements.change.summary.updated", { count: changeRequest.updated_count })}
            </span>
            <span className={cn(PILL_BASE, "bg-danger-subtle text-danger-primary")}>
              {t("workspace_products.requirements.change.summary.deleted", { count: changeRequest.deleted_count })}
            </span>
          </div>
          <span className="text-12 text-secondary">
            {t("workspace_products.requirements.change.summary.total_rows", {
              count: changeRequest.detail_item_count,
            })}
          </span>
        </div>

        <div className="space-y-3 px-4 py-4 md:px-6">
          <DiffGroupCard
            title={t("workspace_products.requirements.change.groups.approval")}
            count={changeRequest.total_count}
            isOpen={openGroups.approval}
            onToggle={() => toggleGroup("approval")}
          >
            <p className="mb-3 text-12 text-secondary">
              {t("workspace_products.requirements.change.rule_summary", {
                rule: approvalRuleLabel(t, changeRequest.approval_type, changeRequest.required_count),
                total: changeRequest.total_count,
                approved: changeRequest.approved_count,
              })}
            </p>
            <ChangeApprovalProgress approvals={changeRequest.approvals} />
          </DiffGroupCard>

          <DiffGroupCard
            title={t("workspace_products.requirements.change.groups.requirement")}
            count={changeRequest.requirement_items.length}
            isOpen={openGroups.requirement && changeRequest.requirement_items.length > 0}
            onToggle={() => toggleGroup("requirement")}
          >
            <MetaDiffTable items={changeRequest.requirement_items} />
          </DiffGroupCard>

          <DiffGroupCard
            title={t("workspace_products.requirements.change.groups.schema")}
            count={changeRequest.schema_items.length}
            isOpen={openGroups.schema && changeRequest.schema_items.length > 0}
            onToggle={() => toggleGroup("schema")}
          >
            <SchemaDiffList items={changeRequest.schema_items} />
          </DiffGroupCard>

          <DiffGroupCard
            title={t("workspace_products.requirements.change.groups.detail")}
            count={changeRequest.detail_item_count}
            isOpen={openGroups.detail && changeRequest.detail_item_count > 0}
            onToggle={() => toggleGroup("detail")}
          >
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
            />
          </DiffGroupCard>
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
