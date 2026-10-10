/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { ISearchIssueResponse } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore, ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import type { TIssueType } from "@/services/project";
import { useProjectIssueTypes } from "./use-project-issue-types";
import type { TWorkItemPickerKind } from "./use-work-item-picker";
import { PICKER_PAGE_SIZE, useWorkItemPicker } from "./use-work-item-picker";
import { WorkItemPickerEmpty } from "./work-item-picker-empty";
import { WorkItemPickerFooter, WorkItemPickerPager } from "./work-item-picker-footer";
import { WorkItemPickerHeader } from "./work-item-picker-header";
import type { TPickerLastColumn } from "./work-item-picker-table";
import { WorkItemPickerTable } from "./work-item-picker-table";
import { WorkItemPickerToolbar } from "./work-item-picker-toolbar";

const I18N = "work_item_picker";

type Props = {
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  /** 加到哪儿：迭代 / 发布 / 模块 */
  kind: TWorkItemPickerKind;
  targetId: string | undefined;
  isOpen: boolean;
  handleClose: () => void;
  handleOnSubmit: (data: ISearchIssueResponse[]) => Promise<void>;
};

type TTab = "available" | "selected";

const TabButton = (props: { active: boolean; label: string; count: number; strong?: boolean; onClick: () => void }) => (
  <button
    type="button"
    role="tab"
    aria-selected={props.active}
    className={cn(
      "relative flex items-center gap-2 px-1.5 text-14 font-medium",
      props.active
        ? "font-semibold text-primary after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-t-sm after:bg-accent-primary"
        : "text-tertiary hover:text-secondary"
    )}
    onClick={props.onClick}
  >
    {props.label}
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-11 font-semibold tabular-nums",
        props.strong ? "bg-accent-primary text-on-color" : "bg-layer-2 text-tertiary"
      )}
    >
      {props.count}
    </span>
  </button>
);

const AddWorkItemsModalContent = observer(function AddWorkItemsModalContent(
  props: Omit<Props, "isOpen" | "workspaceSlug" | "projectId" | "targetId"> & {
    workspaceSlug: string;
    projectId: string;
    targetId: string;
    searchInputRef: React.MutableRefObject<HTMLInputElement | null>;
  }
) {
  const { workspaceSlug, projectId, kind, targetId, handleClose, handleOnSubmit, searchInputRef } = props;
  const { t } = useTranslation();
  const { getProjectIdentifierById } = useProject();
  const picker = useWorkItemPicker({ workspaceSlug, projectId, kind, targetId });
  const issueTypes = useProjectIssueTypes(workspaceSlug, projectId);
  const issueTypeMap = useMemo(
    () => Object.fromEntries(issueTypes.map((type) => [type.id, type])) as Record<string, TIssueType>,
    [issueTypes]
  );
  const [tab, setTab] = useState<TTab>("available");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lastColumn: TPickerLastColumn = kind !== "module" && picker.includeOther ? kind : "created";
  const showBanner =
    tab === "available" && picker.pageSelection === "all" && picker.total > picker.rows.length && !picker.isLoading;

  const onSubmit = async () => {
    // 「选择全部 N 条」还在拉时不能提交，否则只会提交已到手的那部分
    if (picker.selectedCount === 0 || picker.isSelectingAll) return;
    setIsSubmitting(true);
    try {
      await handleOnSubmit(picker.selectedRows);
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const tableCommon = {
    workspaceSlug,
    issueTypeMap,
    lastColumn,
    isSelected: picker.isSelected,
    onToggle: picker.toggleRow,
  };

  let body: React.ReactNode;
  if (tab === "selected") {
    body =
      picker.selectedCount === 0 ? (
        <div className="grid h-full min-h-72 place-items-center text-13 text-placeholder">
          {t(`${I18N}.empty.selected_title`)}
        </div>
      ) : (
        <WorkItemPickerTable
          {...tableCommon}
          rows={picker.selectedRows}
          headSelection="all"
          onToggleHead={picker.clearSelection}
        />
      );
  } else if (picker.isLoading && picker.rows.length === 0) {
    body = (
      <Loader className="space-y-2 px-5 py-3 sm:px-7">
        {Array.from({ length: 8 }, (_, index) => (
          <Loader.Item key={index} height="38px" />
        ))}
      </Loader>
    );
  } else if (picker.hasError && picker.rows.length === 0) {
    body = (
      <div className="grid h-full min-h-72 place-items-center text-13 text-danger-primary">
        {t(`${I18N}.load_error`)}
      </div>
    );
  } else if (picker.rows.length === 0) {
    body = (
      <WorkItemPickerEmpty
        kind={kind}
        query={picker.debouncedSearch}
        narrowed={picker.hasFilters || picker.mine}
        includeOther={picker.includeOther}
        projectIdentifier={getProjectIdentifierById(projectId)}
        onIncludeOther={() => picker.setIncludeOther(true)}
      />
    );
  } else {
    body = (
      <WorkItemPickerTable
        {...tableCommon}
        rows={picker.rows}
        headSelection={picker.pageSelection}
        onToggleHead={picker.togglePage}
        sort={picker.sort}
        onSort={picker.toggleSortColumn}
        dimmed={picker.isLoading}
      />
    );
  }

  return (
    <div className="flex h-[min(90vh,51.25rem)] min-h-0 flex-col">
      <WorkItemPickerHeader kind={kind} targetId={targetId} onClose={handleClose} />

      <div role="tablist" className="flex h-11.5 shrink-0 items-stretch gap-3 border-b border-subtle px-5 sm:px-7">
        <TabButton
          active={tab === "available"}
          label={t(`${I18N}.tabs.available`)}
          count={picker.total}
          onClick={() => setTab("available")}
        />
        <TabButton
          active={tab === "selected"}
          label={t(`${I18N}.tabs.selected`)}
          count={picker.selectedCount}
          strong={picker.selectedCount > 0}
          onClick={() => setTab("selected")}
        />
        {kind !== "module" && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-13 whitespace-nowrap text-secondary">
            <ToggleSwitch value={picker.includeOther} onChange={picker.setIncludeOther} size="sm" />
            {t(`${I18N}.scope.${kind}`)}
          </label>
        )}
      </div>

      {tab === "available" ? (
        <WorkItemPickerToolbar
          projectId={projectId}
          issueTypes={issueTypes}
          picker={picker}
          searchInputRef={searchInputRef}
        />
      ) : (
        <div className="flex shrink-0 items-center gap-3 px-5 pt-3.5 pb-3 text-13 text-tertiary sm:px-7">
          <span className="mr-auto">{t(`${I18N}.selected_summary`, { count: picker.selectedCount })}</span>
          {picker.selectedCount > 0 && (
            <button
              type="button"
              className="font-medium text-accent-primary hover:underline"
              onClick={picker.clearSelection}
            >
              {t(`${I18N}.remove_all`)}
            </button>
          )}
        </div>
      )}

      {showBanner && (
        <div className="flex shrink-0 items-center gap-2 border-t border-accent-subtle bg-accent-subtle px-5 py-2.5 text-13 text-secondary sm:px-7">
          <Info className="size-3.5 shrink-0 text-accent-primary" />
          {picker.allMatchingSelected ? (
            <>
              <span>{t(`${I18N}.all_matching_selected`, { total: picker.total })}</span>
              <button
                type="button"
                className="font-semibold text-accent-primary hover:underline"
                onClick={picker.clearSelection}
              >
                {t(`${I18N}.clear_selection`)}
              </button>
            </>
          ) : (
            <>
              <span>{t(`${I18N}.select_page`, { count: picker.rows.length })}</span>
              <button
                type="button"
                disabled={picker.isSelectingAll}
                className="font-semibold text-accent-primary hover:underline disabled:opacity-60"
                onClick={() => void picker.selectAllMatching()}
              >
                {picker.isSelectingAll
                  ? t(`${I18N}.selecting_all`)
                  : t(`${I18N}.select_all_matching`, { total: picker.total })}
              </button>
            </>
          )}
        </div>
      )}

      <div className="vertical-scrollbar scrollbar-md min-h-0 flex-1 overflow-auto">{body}</div>

      <WorkItemPickerFooter
        left={
          tab === "selected" ? (
            <span className="text-13 text-tertiary">{t(`${I18N}.selected_footer_hint`)}</span>
          ) : picker.total > 0 ? (
            <WorkItemPickerPager
              page={picker.page}
              pageSize={PICKER_PAGE_SIZE}
              total={picker.total}
              onChange={picker.setPage}
            />
          ) : null
        }
        moveHint={
          kind !== "module" && picker.moveCount > 0
            ? t(`${I18N}.move_hint.${kind}`, { count: picker.moveCount })
            : undefined
        }
        selectedCount={picker.selectedCount}
        isSubmitting={isSubmitting}
        isBusy={picker.isSelectingAll}
        onCancel={handleClose}
        onSubmit={() => void onSubmit()}
      />
    </div>
  );
});

/**
 * 迭代 / 发布 / 模块「添加工作项」弹窗：表格 + 多选筛选 + 排序 + 分页 + 跨页选择。
 * 迭代、发布可打开「包含已在其他迭代/发布中的」：迭代加入即从原迭代移走，发布则同时属于多个。
 */
export function AddWorkItemsModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, targetId } = props;
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXXXL}
      className="rounded-2xl sm:max-w-[75rem]"
      initialFocus={searchInputRef}
    >
      {workspaceSlug && projectId && targetId && (
        <AddWorkItemsModalContent
          {...props}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          targetId={targetId}
          searchInputRef={searchInputRef}
        />
      )}
    </ModalCore>
  );
}
