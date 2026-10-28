import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Search, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDevModeIssueType } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { ProjectIssueTypeService } from "@/services/project/project-issue-type.service";

const issueTypeService = new ProjectIssueTypeService();

/** 有工作项在用的已关联类型不能取消关联（与后端 DEV_MODE_TYPE_IN_USE 同口径） */
export const toastTypeInUse = (issueCount: number) =>
  setToast({
    type: TOAST_TYPE.ERROR,
    title: "不能取消关联",
    message: `项目中还有 ${issueCount.toLocaleString()} 条工作项在用，不能取消关联`,
  });

/**
 * 「关联类型」：列出类型库全部类型，勾选即关联到本模式，保存时整体替换。
 *
 * 已关联的默认勾上；其中有工作项在用的锁住（灰显），点它提示在用数。
 * 保存的顺序：原有的保持原顺序，新勾的按类型库顺序接在后面。
 */
export function DevModeLinkTypesModal({
  isOpen,
  workspaceSlug,
  libraryScopeKey,
  devModeName,
  linkedRows,
  onClose,
  onCreateType,
  onSubmit,
}: {
  isOpen: boolean;
  workspaceSlug: string;
  /** 类型库作用域键 `scheme:<库 id>` */
  libraryScopeKey: string | undefined;
  devModeName: string;
  linkedRows: TDevModeIssueType[];
  onClose: () => void;
  /** 底部「新建类型」：关掉本弹窗、打开新建弹窗 */
  onCreateType?: () => void;
  /** 失败时抛出，弹窗保持打开 */
  onSubmit: (issueTypeIds: string[]) => Promise<unknown>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 每次打开都强制拉一遍：别处（模式里新建、类型库增删）改过的类型要看得到
  const { data: libraryTypes } = useSWR(
    isOpen && libraryScopeKey ? `DEV_MODE_LINK_LIBRARY_TYPES_${workspaceSlug}_${libraryScopeKey}` : null,
    () => issueTypeService.fetchProjectIssueTypes(workspaceSlug, libraryScopeKey as string, true),
    { revalidateOnFocus: false, revalidateOnMount: true, dedupingInterval: 0 }
  );

  const linkedById = useMemo(() => new Map(linkedRows.map((row) => [row.issue_type_id, row])), [linkedRows]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setSelected(new Set(linkedRows.map((row) => row.issue_type_id)));
    // 只在打开时取一次初值，保存后列表变化不回填正在编辑的勾选
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!libraryTypes || !keyword) return libraryTypes;
    return libraryTypes.filter((issueType) => issueType.name.toLowerCase().includes(keyword));
  }, [libraryTypes, query]);

  const toggle = (issueTypeId: string) => {
    const linked = linkedById.get(issueTypeId);
    if (linked && linked.issue_count > 0) {
      toastTypeInUse(linked.issue_count);
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(issueTypeId)) next.delete(issueTypeId);
      else next.add(issueTypeId);
      return next;
    });
  };

  const handleSubmit = async () => {
    const kept = linkedRows.map((row) => row.issue_type_id).filter((id) => selected.has(id));
    const keptSet = new Set(kept);
    const added = (libraryTypes ?? []).map((issueType) => issueType.id).filter((id) => selected.has(id) && !keptSet.has(id));
    setIsSubmitting(true);
    try {
      await onSubmit([...kept, ...added]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => !isSubmitting && onClose()}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="shrink-0 text-18 font-semibold text-primary">关联工作项类型</h2>
          <span className="inline-flex h-[26px] min-w-0 items-center truncate rounded-md bg-accent-subtle px-2.5 text-13 font-medium text-accent-primary">
            {devModeName}
          </span>
        </div>
        <button
          type="button"
          className="grid size-8 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-6 pt-4 pb-4">
        <label className="flex h-10 items-center gap-2.5 rounded-lg border border-subtle px-3 text-placeholder focus-within:border-accent-strong">
          <Search className="size-4 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索类型"
            className="w-full border-none bg-transparent text-14 text-primary placeholder:text-placeholder focus:outline-none"
          />
        </label>
      </div>

      <div className="vertical-scrollbar scrollbar-sm max-h-[420px] overflow-y-auto border-t border-subtle">
        {visible === undefined ? (
          <Loader className="flex flex-col gap-1.5 px-6 py-3">
            {[0, 1, 2, 3].map((index) => (
              <Loader.Item key={index} height="44px" />
            ))}
          </Loader>
        ) : visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-13 text-tertiary">
            {query.trim() ? "没有匹配的类型" : "类型库里还没有类型"}
          </p>
        ) : (
          visible.map((issueType) => {
            const linked = linkedById.get(issueType.id);
            const isLocked = !!linked && linked.issue_count > 0;
            const isChecked = isLocked || selected.has(issueType.id);
            return (
              <div
                key={issueType.id}
                role="checkbox"
                aria-checked={isChecked}
                aria-disabled={isLocked}
                tabIndex={0}
                onClick={() => toggle(issueType.id)}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    toggle(issueType.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-3.5 border-b border-subtle px-6 py-2.5 last:border-b-0 focus-visible:bg-layer-transparent-hover focus-visible:outline-none",
                  isLocked ? "cursor-default" : "cursor-pointer hover:bg-layer-transparent-hover"
                )}
              >
                <Checkbox checked={isChecked} disabled={isLocked} readOnly tabIndex={-1} className="pointer-events-none" />
                <TypeIcon
                  iconProps={issueType.logo_props?.icon}
                  className="size-[34px] shrink-0 rounded-lg bg-layer-1"
                  iconClassName="size-[18px]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cn("truncate text-14 font-medium", isLocked ? "text-secondary" : "text-primary")}>
                    {issueType.name}
                  </span>
                  <span className="truncate text-12 text-tertiary">{issueType.category_name ?? ""}</span>
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-subtle px-6 py-3.5">
        {onCreateType ? (
          <button
            type="button"
            className="text-14 text-link-primary hover:text-link-primary-hover disabled:opacity-50"
            onClick={onCreateType}
            disabled={isSubmitting}
          >
            新建类型
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3.5">
          <span className="text-14 text-secondary">
            已选 <b className="font-semibold tabular-nums text-primary">{selected.size}</b> 个
          </span>
          <Button variant="secondary" size="xl" className="px-3" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="xl"
            className="px-3"
            onClick={() => void handleSubmit()}
            loading={isSubmitting}
            disabled={selected.size === 0 || libraryTypes === undefined}
          >
            保存
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
