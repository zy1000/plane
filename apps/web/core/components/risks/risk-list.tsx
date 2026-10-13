import { useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserLite, TCreateRiskPayload, TRisk, TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { ERiskStatus } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { PageSearchInput } from "@/components/pages/list/search-input";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { PLAIN_TABLE, PLAIN_TH } from "@/components/review-tailorings/plain-table";
import { useRisks } from "@/hooks/store/use-risks";
import { useUser } from "@/hooks/store/user";
import { RiskService } from "@/services/risk.service";
import { RISK_I18N } from "./constants";
import { DeleteRiskModal } from "./delete-risk-modal";
import { RiskDrawer } from "./detail/risk-drawer";
import { RiskEmptyState, RiskNoMatch } from "./empty-state";
import { translateRiskError } from "./errors";
import { riskMatchesConditions } from "./filters/match-risk";
import { useRiskFilter } from "./filters/use-risk-filter";
import { useRiskFiltersConfig } from "./filters/use-risk-filters-config";
import { RISKS_HEADER_ACTIONS_ID } from "./header-slots";
import { useRiskPermissions } from "./permissions";
import { RiskFormModal } from "./risk-form-modal";
import { RiskRow } from "./risk-row";

const service = new RiskService();

type TFormState = { mode: "create" } | { mode: "edit"; risk: TRiskDetail } | null;

/** 名称列不给宽度，吃掉剩余宽度；其余定宽。行尾 ⋯ 列没有表头文字 */
const COLUMNS: { key: string; width?: number; className?: string; labelKey?: string }[] = [
  { key: "code", width: 128, className: "pl-6", labelKey: "code" },
  { key: "name", labelKey: "name" },
  { key: "status", width: 124, labelKey: "status" },
  { key: "category", width: 104, labelKey: "category" },
  { key: "level", width: 88, labelKey: "level" },
  { key: "owner", width: 136, labelKey: "owner" },
  { key: "proposer", width: 136, labelKey: "proposer" },
  { key: "proposed_date", width: 112, labelKey: "proposed_date" },
  { key: "planned_handle_date", width: 128, labelKey: "planned_handle_date" },
  { key: "actions", width: 56 },
];

/**
 * 风险列表：一张普通表格，一行一条风险。搜索 / 筛选 / 新建 portal 进页头右侧的挂点，
 * 状态全留在这里；点行开详情抽屉，行尾 ⋯ 是编辑 / 删除。
 *
 * 列表一次全量拉，搜索（编号 / 名称）与富筛选都在前端匹配，按创建时间倒序。
 */
export const RiskList = observer(function RiskList({
  workspaceSlug,
  workspaceId,
  projectId,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { canEdit } = useRiskPermissions(workspaceSlug, projectId);
  const { risks, isLoading, isMutating, error, refresh, createRisk, updateRisk, deleteRisk, applyRisk } = useRisks(
    workspaceSlug,
    projectId
  );

  const [search, setSearch] = useState("");
  const [form, setForm] = useState<TFormState>(null);
  const [toDelete, setToDelete] = useState<TRisk | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openRiskId, setOpenRiskId] = useState<string | null>(null);
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);

  // 挂点在同一次提交里由页头渲染出来，layout effect 时 DOM 已就绪
  useLayoutEffect(() => {
    setActionsHost(document.getElementById(RISKS_HEADER_ACTIONS_ID));
  }, []);

  const filterConfigs = useRiskFiltersConfig({
    workspaceSlug,
    projectId,
    currentUser: currentUser as IUserLite | undefined,
  });
  const filter = useRiskFilter({ configs: filterConfigs, projectId });
  const conditions = filter.allConditionsForDisplay;

  const today = renderFormattedPayloadDate(new Date()) ?? "";
  const keyword = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      risks
        .filter(
          (risk) =>
            (!keyword || risk.code.toLowerCase().includes(keyword) || risk.name.toLowerCase().includes(keyword)) &&
            riskMatchesConditions(risk, conditions, currentUser?.id)
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [risks, keyword, conditions, currentUser?.id]
  );
  const trackingCount = risks.filter((risk) => risk.status === ERiskStatus.TRACKING).length;
  const convertedCount = risks.filter((risk) => risk.status === ERiskStatus.CONVERTED).length;

  const toastFailure = (requestError: unknown) =>
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t(`${RISK_I18N}.form.failed`),
      message: translateRiskError(t, requestError),
    });

  // 成功才在这里弹 toast；失败让弹窗自己接住显示在页脚
  const handleCreate = async (payload: TCreateRiskPayload) => {
    const created = await createRisk(payload);
    setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${RISK_I18N}.form.create_success`) });
    return created;
  };

  const handleUpdate = async (riskId: string, payload: TUpdateRiskPayload) => {
    const updated = await updateRisk(riskId, payload);
    setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${RISK_I18N}.form.update_success`) });
    return updated;
  };

  /** 列表行只有摘要，编辑要先把三段富文本拉回来 */
  const handleOpenEdit = (risk: TRisk) => {
    service
      .retrieve(workspaceSlug, projectId, risk.id)
      .then((detail) => setForm({ mode: "edit", risk: detail }))
      .catch(toastFailure);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      await deleteRisk(toDelete.id);
      if (openRiskId === toDelete.id) setOpenRiskId(null);
      setToDelete(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${RISK_I18N}.form.delete_success`) });
    } catch (requestError) {
      toastFailure(requestError);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAll = () => {
    setSearch("");
    void filter.clearFilters();
  };

  const headerActions = (
    <>
      <PageSearchInput searchQuery={search} updateSearchQuery={setSearch} placeholder={t(`${RISK_I18N}.header.search`)} />
      <FiltersToggle filter={filter} enableQuickAddFilter={false} />
      {canEdit && (
        <Button variant="primary" size="lg" onClick={() => setForm({ mode: "create" })}>
          {t(`${RISK_I18N}.header.create`)}
        </Button>
      )}
    </>
  );

  const renderBody = () => {
    if (isLoading) {
      return (
        <Loader className="space-y-3 p-6">
          <Loader.Item height="32px" />
          <Loader.Item height="180px" />
        </Loader>
      );
    }
    if (risks.length === 0) {
      return <RiskEmptyState canCreate={canEdit} onCreate={() => setForm({ mode: "create" })} />;
    }
    if (visible.length === 0) {
      return <RiskNoMatch onClear={handleClearAll} />;
    }
    return (
      <table className={cn(PLAIN_TABLE, "min-w-[1180px] table-fixed")}>
        <colgroup>
          {COLUMNS.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.key} className={cn(PLAIN_TH, "sticky top-0 z-[2]", column.className)}>
                {column.labelKey ? t(`${RISK_I18N}.table.${column.labelKey}`) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((risk) => (
            <RiskRow
              key={risk.id}
              risk={risk}
              today={today}
              canEdit={canEdit}
              isActive={openRiskId === risk.id}
              onOpen={() => setOpenRiskId(risk.id)}
              onEdit={() => handleOpenEdit(risk)}
              onDelete={() => setToDelete(risk)}
            />
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {actionsHost && createPortal(headerActions, actionsHost)}

      <FiltersRow
        filter={filter}
        summary={t(`${RISK_I18N}.summary.filtered`, { shown: visible.length, total: risks.length })}
      />

      {error && <p className="px-6 py-3 text-12 text-danger-primary">{error}</p>}

      <div className="min-h-0 flex-1 overflow-auto">{renderBody()}</div>

      {risks.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t border-subtle px-6 py-2.5 text-12 text-tertiary tabular-nums">
          <span>{t(`${RISK_I18N}.summary.total`, { count: risks.length })}</span>
          <span aria-hidden="true">·</span>
          <span>{t(`${RISK_I18N}.summary.tracking`, { count: trackingCount })}</span>
          <span aria-hidden="true">·</span>
          <span>{t(`${RISK_I18N}.summary.converted`, { count: convertedCount })}</span>
        </div>
      )}

      <RiskFormModal
        isOpen={Boolean(form)}
        form={form}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        isSubmitting={isMutating}
        onClose={() => setForm(null)}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
      />

      <DeleteRiskModal
        isOpen={Boolean(toDelete)}
        risk={toDelete}
        isSubmitting={isDeleting}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
      />

      <RiskDrawer
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        riskId={openRiskId}
        canEdit={canEdit}
        currentUserId={currentUser?.id}
        onClose={() => setOpenRiskId(null)}
        onUpdated={applyRisk}
        onDeleted={() => {
          setOpenRiskId(null);
          void refresh();
        }}
      />
    </div>
  );
});
