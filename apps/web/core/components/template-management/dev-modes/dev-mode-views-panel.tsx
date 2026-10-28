import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useSearchParams } from "react-router";
import useSWR from "swr";
import { ExternalLink, GripVertical, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSchemeView, TViewScope } from "@plane/types";
import { AlertModalCore, CustomMenu, EModalPosition, EModalWidth, Input, ModalCore, Sortable } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { ViewLayoutIcon } from "@/components/views/in-page/view-tab-parts";
import { useMember } from "@/hooks/store/use-member";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useTemplatePermissions } from "../permissions";
import { useDevModeDetailContext } from "./context";
import { projectViewPagePath } from "./routes";
import { describeViewConditions, ViewConditionChip } from "./scheme-view-conditions";
import type { TConditionNameResolvers } from "./scheme-view-conditions";

const SCOPES: { key: TViewScope; label: string }[] = [
  { key: "issues", label: "工作项" },
  { key: "defects", label: "缺陷" },
  { key: "requirements", label: "项目研发需求" },
];

const getScope = (view: TSchemeView): TViewScope => view.scope ?? "issues";

const MENU_ITEM_CLASS = "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-13 text-primary";

const RenameSchemeViewModal = ({
  view,
  onClose,
  onSubmit,
}: {
  view: TSchemeView | null;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) => {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (view) setName(view.name);
  }, [view]);

  const canSubmit = name.trim().length > 0 && name.trim() !== view?.name && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(name.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={!!view}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.MD}
      initialFocus={inputRef}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        className="flex flex-col"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h3 className="text-18 font-semibold text-primary">重命名视图</h3>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1.5 grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 pt-5">
          <Input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="视图名称"
            inputSize="md"
            className="h-10 w-full rounded-lg text-14"
            maxLength={255}
          />
        </div>
        <div className="flex justify-end gap-2.5 px-6 pt-6 pb-5">
          <Button variant="secondary" size="xl" type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="xl" type="submit" disabled={!canSubmit} loading={isSubmitting}>
            保存
          </Button>
        </div>
      </form>
    </ModalCore>
  );
};

/**
 * 模式页「视图」页签：跟随本模式的项目共用的页内视图。
 *
 * 这里只排序、改名、删除；新建与改条件在跟随项目的页面里做（另存时「谁能看到」选「研发模式全部项目」，
 * 改了条件点「更新到研发模式」），「在项目中打开」就是去那里改。
 */
export const DevModeViewsPanel = observer(function DevModeViewsPanel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaceSlug, scopeKey, schemeViewsStore } = useDevModeDetailContext();
  // 条件里的类型名：类型都在类型库里，按库的作用域拉
  const issueTypesStore = useProjectIssueTypes(workspaceSlug, scopeKey);
  const { canManageDevModes: canEdit } = useTemplatePermissions(workspaceSlug);
  const { fetchProjectStates, getStateById } = useProjectState();
  const { getUserDetails } = useMember();
  // state
  const [renaming, setRenaming] = useState<TSchemeView | null>(null);
  const [deleting, setDeleting] = useState<TSchemeView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 条件里的状态名：状态挂在类型下，列表接口不传类型只回无类型的状态，所以按类型库的每个类型各拉一次
  const issueTypeIds = (issueTypesStore.issueTypes ?? []).map((issueType) => issueType.id);
  useSWR(
    scopeKey && issueTypeIds.length > 0 ? `SCHEME_VIEW_STATES_${workspaceSlug}_${scopeKey}_${issueTypeIds.join(",")}` : null,
    scopeKey
      ? () => Promise.all(issueTypeIds.map((issueTypeId) => fetchProjectStates(workspaceSlug, scopeKey, issueTypeId)))
      : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const views = schemeViewsStore.views;
  const counts = Object.fromEntries(
    SCOPES.map(({ key }) => [key, (views ?? []).filter((view) => getScope(view) === key).length])
  ) as Record<TViewScope, number>;
  const requestedScope = searchParams.get("scope");
  const scope: TViewScope = SCOPES.some((item) => item.key === requestedScope)
    ? (requestedScope as TViewScope)
    : (SCOPES.find((item) => counts[item.key] > 0)?.key ?? "issues");
  const scopedViews = (views ?? []).filter((view) => getScope(view) === scope);
  const scopeLabel = SCOPES.find((item) => item.key === scope)?.label ?? "";

  const resolvers: TConditionNameResolvers = {
    getTypeName: (id) => issueTypesStore.issueTypes?.find((issueType) => issueType.id === id)?.name,
    getStateName: (id) => getStateById(id)?.name,
    getUserName: (id) => getUserDetails(id)?.display_name,
  };

  const handleReorder = async (next: TSchemeView[]) => {
    try {
      await schemeViewsStore.reorderViews(next.map((view) => view.id));
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "排序没有保存成功", message: "请稍后重试" });
    }
  };

  const handleRename = async (name: string) => {
    if (!renaming) return;
    try {
      await schemeViewsStore.renameView(renaming.id, name);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "改名失败", message: "请稍后重试" });
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await schemeViewsStore.deleteView(deleting.id);
      setDeleting(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: "请稍后重试" });
    } finally {
      setIsDeleting(false);
    }
  };

  const renderRow = (view: TSchemeView) => {
    const conditions = describeViewConditions(view, resolvers);
    const source = view.source_project_detail;
    const ownerName = getUserDetails(view.owned_by)?.display_name ?? "";
    const hasMenu = canEdit || !!view.open_project_id;
    return (
      <div className="group flex h-13 items-center gap-3 border-b border-subtle pr-3 pl-2 text-13 text-primary last:border-b-0 hover:bg-layer-transparent-hover">
        {canEdit ? (
          <span
            data-sortable-drag-handle
            className="grid w-4.5 shrink-0 cursor-grab place-items-center text-placeholder hover:text-tertiary"
          >
            <GripVertical className="size-3.5" />
          </span>
        ) : (
          <span className="w-0.5 shrink-0" />
        )}
        <span className="flex w-44 shrink-0 items-center gap-2">
          <ViewLayoutIcon view={view} className="text-tertiary" />
          <span className="min-w-0 truncate font-medium">{view.name}</span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {conditions.length > 0 ? (
            conditions.map((condition) => <ViewConditionChip key={condition.key} condition={condition} />)
          ) : (
            <span className="text-tertiary">无条件，看全部</span>
          )}
        </span>
        <span className="flex w-56 shrink-0 items-center gap-2 text-12 text-secondary">
          <ButtonAvatars showTooltip userIds={view.owned_by} size="sm" />
          <span className="min-w-0 truncate">
            {ownerName}
            {source && <span className="text-tertiary"> · {source.name}</span>}
          </span>
        </span>
        <span className="w-22 shrink-0 text-12 text-tertiary tabular-nums">
          {renderFormattedDate(view.updated_at, "yyyy-MM-dd")}
        </span>
        <span className="grid w-7 shrink-0 place-items-center">
          {hasMenu && (
            <CustomMenu
              placement="bottom-end"
              ariaLabel="更多操作"
              customButton={<MoreHorizontal className="size-4" />}
              customButtonClassName="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
              optionsClassName="w-48 rounded-lg border-subtle px-1.5 py-1.5 shadow-overlay-200"
              closeOnSelect
            >
              {canEdit && (
                <CustomMenu.MenuItem className={MENU_ITEM_CLASS} onClick={() => setRenaming(view)}>
                  <Pencil className="size-4 shrink-0 text-tertiary" />
                  重命名
                </CustomMenu.MenuItem>
              )}
              {view.open_project_id && (
                <CustomMenu.MenuItem
                  className={MENU_ITEM_CLASS}
                  onClick={() =>
                    navigate(projectViewPagePath(workspaceSlug, view.open_project_id as string, scope, view.id))
                  }
                >
                  <ExternalLink className="size-4 shrink-0 text-tertiary" />
                  在项目中打开
                </CustomMenu.MenuItem>
              )}
              {canEdit && (
                <>
                  <div className="mx-1 my-1.5 h-px bg-layer-3" />
                  <CustomMenu.MenuItem
                    className={cn(MENU_ITEM_CLASS, "text-danger-primary")}
                    onClick={() => setDeleting(view)}
                  >
                    <Trash2 className="size-4 shrink-0" />
                    删除
                  </CustomMenu.MenuItem>
                </>
              )}
            </CustomMenu>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 px-7 py-6">
      <nav className="inline-flex gap-0.5 self-start rounded-[9px] bg-layer-1 p-[3px]" aria-label="视图所在页面">
        {SCOPES.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSearchParams({ scope: item.key }, { replace: true })}
            className={cn(
              "flex h-[30px] items-center gap-1.5 rounded-[7px] px-4 text-13 transition-colors",
              scope === item.key
                ? "bg-surface-1 font-semibold text-primary shadow-raised-100"
                : "text-secondary hover:text-primary"
            )}
          >
            {item.label}
            <span className="text-12 font-medium text-tertiary tabular-nums">{counts[item.key]}</span>
          </button>
        ))}
      </nav>

      {views === undefined ? (
        <div className="h-40 animate-pulse rounded-xl bg-layer-1" />
      ) : scopedViews.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-subtle px-6 py-12 text-center">
          <span className="text-14 font-medium text-primary">还没有{scopeLabel}视图</span>
          <span className="text-13 text-tertiary">
            在跟随本模式的项目里另存视图时，「谁能看到」选「研发模式全部项目」即可加到这里
          </span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-subtle">
          <div className="flex h-10 items-center gap-3 border-b border-subtle bg-layer-1 pr-3 pl-2 text-12 font-medium text-tertiary">
            <span className={canEdit ? "w-4.5 shrink-0" : "w-0.5 shrink-0"} />
            <span className="w-44 shrink-0">名称</span>
            <span className="min-w-0 flex-1">条件</span>
            <span className="w-56 shrink-0">发布人 · 来源项目</span>
            <span className="w-22 shrink-0">更新</span>
            <span className="w-7 shrink-0" />
          </div>
          {canEdit ? (
            <Sortable
              data={scopedViews}
              keyExtractor={(view) => view.id}
              render={(view) => renderRow(view)}
              onChange={(next) => void handleReorder(next)}
            />
          ) : (
            scopedViews.map((view) => <div key={view.id}>{renderRow(view)}</div>)
          )}
        </div>
      )}

      <RenameSchemeViewModal view={renaming} onClose={() => setRenaming(null)} onSubmit={handleRename} />

      <AlertModalCore
        isOpen={!!deleting}
        variant="danger"
        isSubmitting={isDeleting}
        title="删除研发模式视图"
        primaryButtonText={{ loading: "删除中", default: "删除" }}
        secondaryButtonText="取消"
        content={
          <>
            确定删除视图「<span className="font-medium text-primary">{deleting?.name}</span>
            」？跟随本模式的项目页签里都会少掉它，此操作不可撤销。
          </>
        }
        handleClose={() => !isDeleting && setDeleting(null)}
        handleSubmit={() => void handleDelete()}
      />
    </div>
  );
});
