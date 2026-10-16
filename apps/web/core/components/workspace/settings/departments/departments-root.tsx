import { useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Loader } from "@plane/ui";
import { renderFormattedDateTime } from "@plane/utils";
import { formatSyncSummary, getIntegrationErrorMessage } from "@/components/workspace/settings/integrations/helpers";
import type { TDepartmentsState } from "@/hooks/store/use-departments";
import { DepartmentPeopleHeader } from "./department-people-header";
import { DepartmentPeopleTable } from "./department-people-table";
import { DepartmentPeopleToolbar } from "./department-people-toolbar";
import { DepartmentTree } from "./department-tree";
import { DEPARTMENTS_I18N as I18N, resolveSelection } from "./helpers";

type Props = TDepartmentsState & { canSync: boolean };

/** 部门设置页正文（只读）。纯 props 组件，状态来自 use-departments。 */
export function DepartmentsRoot(props: Props) {
  const {
    canSync,
    tree,
    isTreeLoading,
    treeError,
    fetchTree,
    people,
    isPeopleLoading,
    filters,
    selectDepartment,
    setIncludeChildren,
    setSearch,
    setLeader,
    setLogin,
    setPage,
    setPerPage,
    isSyncing,
    sync,
  } = props;
  const { t } = useTranslation();
  const selection = resolveSelection(tree, filters.department);
  const lastSync = tree?.sync.last_sync ?? null;

  const handleSync = useCallback(async () => {
    try {
      const response = await sync();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t(`${I18N}.synced`),
        message: response?.result.summary ? formatSyncSummary(response.result.summary, t) : undefined,
      });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: getIntegrationErrorMessage(error, t) });
    }
  }, [sync, t]);

  const renderSyncStatus = () => {
    if (!tree) return null;
    if (!tree.sync.is_configured) return <span className="text-13 text-warning-primary">{t(`${I18N}.not_configured`)}</span>;
    if (!lastSync) return <span className="text-13 text-tertiary">{t(`${I18N}.never_synced`)}</span>;
    const time = renderFormattedDateTime(lastSync.finished_at).slice(5, 16);
    const failed = lastSync.status !== "success";
    return (
      <span className="flex items-center gap-2 text-13 text-secondary">
        <span className={`size-2 rounded-full ${failed ? "bg-danger-primary" : "bg-success-primary"}`} />
        {failed
          ? t(`${I18N}.last_sync_failed`, { time })
          : t(`${I18N}.last_sync`, { time, who: lastSync.triggered_by?.display_name ?? t(`${I18N}.by_schedule`) })}
      </span>
    );
  };

  if (!tree) {
    if (treeError && !isTreeLoading) {
      return (
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${I18N}.load_failed`)}</p>
          <Button className="mt-3" variant="secondary" onClick={() => void fetchTree()}>
            {t("retry")}
          </Button>
        </div>
      );
    }
    return (
      <Loader className="flex flex-col gap-4">
        <Loader.Item height="56px" width="100%" />
        <Loader.Item height="560px" width="100%" />
      </Loader>
    );
  }

  const hasFilters = Boolean(filters.search.trim() || filters.leader || filters.login);
  const showDepartmentColumn = selection.kind === "all" || (selection.kind === "center" && filters.includeChildren);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-20 font-semibold text-primary">{t(`${I18N}.title`)}</h1>
          <p className="text-13 text-secondary">
            {t(`${I18N}.summary`, { centers: tree.center_count, departments: tree.department_count, people: tree.assigned })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {renderSyncStatus()}
          {canSync && (
            <Button
              variant="primary"
              prependIcon={<RefreshCw />}
              loading={isSyncing}
              disabled={!tree.sync.is_configured || isSyncing}
              onClick={() => void handleSync()}
            >
              {t(`${I18N}.${isSyncing ? "syncing" : "sync_now"}`)}
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1 md:flex-row">
        <DepartmentTree tree={tree} selected={filters.department} onSelect={selectDepartment} />
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 px-5 py-4">
            <DepartmentPeopleHeader selection={selection} onSelect={selectDepartment} />
            <DepartmentPeopleToolbar
              search={filters.search}
              onSearchChange={setSearch}
              leaders={people?.leaders ?? []}
              leader={filters.leader}
              onLeaderChange={setLeader}
              login={filters.login}
              onLoginChange={setLogin}
              showIncludeChildren={selection.kind === "center" && selection.node.children.length > 0}
              includeChildren={filters.includeChildren}
              onIncludeChildrenChange={setIncludeChildren}
            />
          </div>
          <DepartmentPeopleTable
            people={people?.results ?? []}
            total={people?.total ?? 0}
            isLoading={isPeopleLoading}
            hasFilters={hasFilters}
            showDepartment={showDepartmentColumn}
            page={filters.page}
            perPage={filters.perPage}
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        </section>
      </div>
    </div>
  );
}
