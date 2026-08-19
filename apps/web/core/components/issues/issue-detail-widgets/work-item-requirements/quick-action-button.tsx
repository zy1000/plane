/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { PlusIcon } from "@plane/propel/icons";
// plane imports
import type { TIssueServiceType } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  customButton?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

/**
 * 打开「关联需求」弹窗的触发器（照 links/quick-action-button）。弹窗本体在
 * issue-detail-widget-modals 里，开关走 issue-detail store —— 快捷操作条与折叠头的 +
 * 是两个入口，共用一个弹窗。
 */
export const WorkItemRequirementsActionButton = observer(function WorkItemRequirementsActionButton(props: Props) {
  const { customButton, className, disabled = false, issueServiceType } = props;
  // store hooks
  const { toggleWorkItemRequirementLinkModal } = useIssueDetail(issueServiceType);

  // handlers
  const handleOnClick = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWorkItemRequirementLinkModal(true);
  };

  return (
    <button
      type="button"
      onClick={handleOnClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-1 outline-none focus-visible:ring-0 disabled:cursor-not-allowed",
        className
      )}
    >
      {customButton ? customButton : <PlusIcon className="h-4 w-4" />}
    </button>
  );
});
