/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MinusCircle, Network } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// component
// ui
import { ControlLink, CustomMenu } from "@plane/ui";
// helpers
import { generateWorkItemLink } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web components
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
// local components
import { ParentIssuesListModal } from "../../parent-issues-list-modal";
// types
import type { TIssueOperations } from "../root";
import { IssueParentSiblings } from "./siblings";

export type TIssueParentDetail = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issue: TIssue;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

export const IssueParentDetail = observer(function IssueParentDetail(props: TIssueParentDetail) {
  const { workspaceSlug, projectId, issueId, issue, issueOperations, disabled = false } = props;
  // router
  const router = useRouter();
  const { t } = useTranslation();
  // hooks
  const { issueMap } = useIssues();
  const { handleRedirection } = useIssuePeekOverviewRedirection();
  const { isMobile } = usePlatformOS();
  const { getProjectIdentifierById } = useProject();
  const { isParentIssueModalOpen, toggleParentIssueModal } = useIssueDetail();
  // 菜单展开时强制保持 "..." 按钮可见，避免鼠标移出后按钮和下拉框一起消失
  const [isSiblingsMenuOpen, setIsSiblingsMenuOpen] = useState(false);
  // 用于规避 CustomMenu 内部 onMenuClose 与 menuButtonOnClick 在同一次点击里的触发顺序：
  // 当点击按钮关闭菜单时，onMenuClose 会先于 menuButtonOnClick 同步触发，这里用来识别并忽略那次点击
  const justClosedRef = useRef(false);

  // derived values
  const parentIssue = issueMap?.[issue.parent_id || ""] || undefined;
  const isParentEpic = parentIssue?.is_epic;
  const projectIdentifier = getProjectIdentifierById(parentIssue?.project_id);

  // 无父项且不允许编辑时，不渲染组件
  if (!parentIssue && disabled) return <></>;

  const workItemLink = parentIssue
    ? generateWorkItemLink({
        workspaceSlug,
        projectId: parentIssue?.project_id,
        issueId: parentIssue.id,
        projectIdentifier,
        sequenceId: parentIssue.sequence_id,
        isEpic: isParentEpic,
      })
    : "";

  const handleParentIssueClick = () => {
    if (!parentIssue) return;
    if (isParentEpic) router.push(workItemLink);
    else handleRedirection(workspaceSlug, parentIssue, isMobile);
  };

  const handleAddParent = async (selected: any) => {
    if (!selected?.id) return;
    await issueOperations.update(workspaceSlug, projectId, issueId, { parent_id: selected.id });
    toggleParentIssueModal(null);
  };

  return (
    <>
      {!parentIssue && (
        <ParentIssuesListModal
          projectId={projectId}
          issueId={issueId}
          isOpen={isParentIssueModalOpen === issueId}
          handleClose={() => toggleParentIssueModal(null)}
          onChange={handleAddParent}
        />
      )}
      {/* min-h-5 固定该行高度（>=hover 时 "..." 按钮的高度），避免按钮出现时撑高行，导致下方内容上下抖动 */}
      <div className="mb-5 flex min-h-5 w-min items-center gap-2 text-caption-sm-regular whitespace-nowrap">
        {parentIssue ? (
          <div className="group flex items-center gap-1.5">
            <ControlLink href={workItemLink} onClick={handleParentIssueClick}>
              {parentIssue.project_id && (
                <IssueIdentifier
                  projectId={parentIssue.project_id}
                  issueId={parentIssue.id}
                  size="xs"
                  variant="secondary"
                />
              )}
            </ControlLink>

            <div className={isSiblingsMenuOpen ? "block" : "hidden group-hover:block"}>
              <CustomMenu
                ellipsis
                optionsClassName="p-1.5"
                buttonClassName="!p-0.5"
                menuButtonOnClick={() => {
                  // 点击按钮关闭菜单时，onMenuClose 已先于此回调置为关闭，这里跳过，避免把状态又翻回 true
                  if (justClosedRef.current) {
                    justClosedRef.current = false;
                    return;
                  }
                  setIsSiblingsMenuOpen(true);
                }}
                onMenuClose={() => {
                  justClosedRef.current = true;
                  setIsSiblingsMenuOpen(false);
                  queueMicrotask(() => {
                    justClosedRef.current = false;
                  });
                }}
              >
                <div className="border-b border-strong text-caption-sm-regular font-medium text-secondary">
                  {t("issue.sibling.label")}
                </div>

                <IssueParentSiblings workspaceSlug={workspaceSlug} currentIssue={issue} parentIssue={parentIssue} />

                {!disabled && (
                  <CustomMenu.MenuItem
                    onClick={() => issueOperations.update(workspaceSlug, projectId, issueId, { parent_id: null })}
                    className="flex items-center gap-2 py-2 text-danger-primary"
                  >
                    <MinusCircle className="h-4 w-4" />
                    <span>{t("issue.remove.parent.label")}</span>
                  </CustomMenu.MenuItem>
                )}
              </CustomMenu>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => toggleParentIssueModal(issueId)}
            className="inline-flex min-h-0 items-center gap-1.5 p-0 font-medium text-secondary hover:text-primary"
          >
            <Network className="h-3 w-3 shrink-0" aria-hidden />
            <span className="leading-[inherit]">{t("issue.add.parent")}</span>
          </button>
        )}

        <span className="text-tertiary select-none" aria-hidden>
          /
        </span>

        {issue.project_id && (
          <span className="inline-flex min-h-0 items-center self-center">
            <IssueIdentifier projectId={issue.project_id} issueId={issue.id} size="xs" variant="secondary" />
          </span>
        )}
      </div>
    </>
  );
});
