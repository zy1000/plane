/**
 * 变更单评审页。
 *
 * 一张单覆盖 1..N 条需求，N 通常是个位数，所以详情接口把条目直接内联下来：
 * - N == 1：整宽渲染那一条的前后对比，不加任何导航层
 * - 1 < N <= 阈值：左栏列出这几条，右侧渲染选中那条的对比
 * - N 超过阈值（requirement_items 为 null）：回落到分页的网格 diff，那是它擅长的场景
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirementApprovalAction,
  TRequirementField,
  TRequirementTypeSchema,
  IUserLite,
} from "@plane/types";
import { AlertModalCore, Avatar, Loader } from "@plane/ui";
import { cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { useRequirementChangeRequestDetail } from "@/hooks/store/use-requirement-changes";
import { ChangeApprovalBar } from "./change-approval-bar";
import { ChangeApprovalProgress } from "./change-approval-progress";

import { ChangeRequestRequirementDiff } from "./change-request-requirement-diff";
import { RequirementDiffGrid } from "./requirement-diff-grid";
import { approvalRuleLabel, CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL } from "./styles";
import { useChangeItemFilters } from "./use-change-item-filters";

type TProps = {
  workspaceSlug: string;
  productId: string;
  changeRequestId: string;
  fields: TRequirementField[];
  /** 引用到的需求类型（含各自的内置字段布局），diff 列序按当前类型的布局排 */
  requirementTypes?: TRequirementTypeSchema[];
  members: IUserLite[];
  onBack: () => void;
  /** 审批 / 撤回之后需求状态会变，通知外层刷新 */
  onSettled: () => void;
};

export function ChangeRequestDetail(props: TProps) {
  const { workspaceSlug, productId, changeRequestId, fields, requirementTypes, members, onBack, onSettled } = props;
  const { t } = useTranslation();
  const {
    changeType,
    changedColumnsOnly,
    requestedRequirementTypeId,
    setChangeType,
    setChangedColumnsOnly,
    setRequirementTypeId,
  } = useChangeItemFilters();
  // 详情要先回来才知道有哪些需求类型，所以先按 URL 上的值取数，收敛后再由 effect 纠正
  const store = useRequirementChangeRequestDetail({
    workspaceSlug,
    productId,
    changeRequestId,
    changeType,
    requirementTypeId: requestedRequirementTypeId,
  });
  const { changeRequest } = store;
  /** 左栏选中的需求；null = 用第一条 */
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // 单类型需求（含需求类型自身）不分视图，行为与今天完全一致
  const requirementTypeStats = changeRequest?.requirement_type_stats ?? [];
  const activeRequirementTypeId =
    requirementTypeStats.length > 1
      ? (requirementTypeStats.find((item) => item.id === requestedRequirementTypeId)?.id ?? requirementTypeStats[0].id)
      : undefined;
  /** 表头只取当前类型的字段：并集会让每行只填得满自己那几列，其余全是空洞 */
  const requirementTypeFields = useMemo(
    () => (activeRequirementTypeId ? fields.filter((field) => field.requirement_type_id === activeRequirementTypeId) : fields),
    [activeRequirementTypeId, fields]
  );
  /** 某个类型的内置字段布局；查不到（旧缓存）回退 null = 现状顺序 */
  const builtinLayoutOfType = (requirementTypeId?: string | null) =>
    requirementTypes?.find((schema) => schema.id === requirementTypeId)?.builtin_fields ?? null;
  const gridBuiltinLayout = builtinLayoutOfType(activeRequirementTypeId ?? requirementTypeStats[0]?.id);

  /**
   * 内联条目；requirement_items 为 null 说明超过阈值，走分页网格。
   *
   * 这三行必须待在**所有早退之前** —— 详情没回来那一轮会在下面 return 掉，
   * 把 useMemo 写在早退之后，两轮渲染的 hooks 数量就对不上了。
   */
  const inlineItems = changeRequest?.requirement_items ?? null;
  const activeItem = inlineItems?.find((item) => item.id === activeItemId) ?? inlineItems?.[0] ?? null;
  /** 单条需求的对比只取它自己那个类型的字段，用并集会多出一堆空洞行 */
  const activeItemFields = useMemo(
    () =>
      activeItem
        ? fields.filter(
            (field) => !field.requirement_type_id || field.requirement_type_id === activeItem.requirement_type_id
          )
        : [],
    [activeItem, fields]
  );

  // 把收敛后的类型写回 URL：明细分页在服务端按 requirement_type_id 过滤，两边必须是同一个值。
  // 详情没回来之前不能动 URL，否则会把分享链接上的 tpl 抹掉。
  useEffect(() => {
    if (!changeRequest) return;
    if (activeRequirementTypeId) {
      if (activeRequirementTypeId !== requestedRequirementTypeId) setRequirementTypeId(activeRequirementTypeId);
    } else if (requestedRequirementTypeId) setRequirementTypeId(undefined);
  }, [activeRequirementTypeId, changeRequest, requestedRequirementTypeId, setRequirementTypeId]);

  const act = async (action: TRequirementApprovalAction, comment: string, revert = false) => {
    try {
      await store.actOnChangeRequest(action, comment, revert);
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
          {store.error && <p className="mt-1 text-13 text-secondary">{store.error}</p>}
          <Button className="mt-3" variant="secondary" onClick={onBack}>
            {t("common.back")}
          </Button>
        </div>
      </div>
    );
  }

  const rule = approvalRuleLabel(t, changeRequest.approval_type, changeRequest.required_count);
  // 无需评审的单没有「x/y 已通过」可讲，直接给规则文案
  const ruleSummary =
    changeRequest.approval_type === "none"
      ? rule
      : t("workspace_products.requirements.change.rule_summary", {
          rule,
          total: changeRequest.total_count,
          approved: changeRequest.approved_count,
        });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto text-13">
        <header>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-subtle px-4 py-3 md:px-6">
            <button
              type="button"
              onClick={onBack}
              aria-label={t("common.back")}
              className="grid size-7 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent-strong"
            >
              <ArrowLeft className="size-4" />
            </button>
            <h1 className="shrink-0 text-16 leading-6 font-semibold text-primary tabular-nums">
              CR-{changeRequest.sequence_id}
            </h1>
            <span aria-hidden className="h-4 w-px shrink-0 bg-layer-3" />
            <span
              title={changeRequest.reason || t("workspace_products.requirements.change.untitled")}
              className="max-w-64 truncate text-13 text-secondary"
            >
              {changeRequest.reason || t("workspace_products.requirements.change.untitled")}
            </span>
            <span aria-hidden className="hidden h-4 w-px shrink-0 bg-layer-3 sm:block" />
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-13 text-tertiary">
              <Avatar
                size="sm"
                name={changeRequest.created_by_detail?.display_name ?? ""}
                src={getFileURL(changeRequest.created_by_detail?.avatar_url ?? "")}
              />
              {changeRequest.created_by_detail?.display_name && (
                <span className="font-medium text-secondary">{changeRequest.created_by_detail.display_name}</span>
              )}
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {`${renderFormattedDate(changeRequest.created_at, "MM-dd")} ${renderFormattedTime(changeRequest.created_at)}`}
              </span>
            </div>
            <div className="ml-auto">
              <ChangeApprovalProgress
                approvals={changeRequest.approvals}
                approvalType={changeRequest.approval_type}
                status={changeRequest.status}
                summary={ruleSummary}
              />
            </div>
          </div>

        </header>

        {inlineItems ? (
          inlineItems.length === 1 ? (
            // 单条：不加任何导航层，整宽直接给对比
            <div className="px-4 py-4 md:px-6">
              <ChangeRequestRequirementDiff
                item={inlineItems[0]}
                fields={activeItemFields}
                builtinLayout={builtinLayoutOfType(inlineItems[0].requirement_type_id)}
                workspaceSlug={workspaceSlug}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-col md:flex-row">
              {/* 左栏：这张单覆盖的几条需求。N 是个位数，用列表而不是树 */}
              <nav
                aria-label={t("workspace_products.requirements.change.requirements_in_request")}
                className="shrink-0 border-b border-subtle md:w-64 md:border-r md:border-b-0"
              >
                {inlineItems.map((item) => {
                  const isActive = item.id === activeItem?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveItemId(item.id)}
                      className={cn(
                        "flex w-full items-start gap-2 border-b border-subtle px-3 py-2 text-left last:border-b-0",
                        isActive ? "bg-accent-subtle/40" : "hover:bg-layer-1"
                      )}
                    >
                      <span
                        className={cn(CHANGE_TYPE_BADGE, CHANGE_TYPE_PILL[item.change_type], "mt-0.5 shrink-0")}
                      >
                        {t(`workspace_products.requirements.change.change_type.${item.change_type}`)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-13 text-primary">
                          {item.title || t("requirement_detail.untitled")}
                        </span>
                        <span className="block truncate text-13 text-tertiary">
                          {item.requirement_type_name}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>
              <div className="min-w-0 flex-1 px-4 py-4 md:px-6">
                {activeItem && (
                  <ChangeRequestRequirementDiff
                    item={activeItem}
                    fields={activeItemFields}
                    builtinLayout={builtinLayoutOfType(activeItem.requirement_type_id)}
                    workspaceSlug={workspaceSlug}
                  />
                )}
              </div>
            </div>
          )
        ) : (
          // 条目多到内联不下（整个类型视图一次提交），回落到分页网格
          <RequirementDiffGrid
            workspaceSlug={workspaceSlug}
            fields={requirementTypeFields}
            builtinLayout={gridBuiltinLayout}
            changedFieldIds={changeRequest.changed_field_ids}
            requirementTypes={requirementTypeStats}
            activeRequirementTypeId={activeRequirementTypeId}
            onTemplateChange={setRequirementTypeId}
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

      <ChangeApprovalBar
        changeRequest={changeRequest}
        isMutating={store.isMutating}
        onApprove={(comment) => void act("approved", comment)}
        onReject={(comment, revert) => void act("rejected", comment, revert)}
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
