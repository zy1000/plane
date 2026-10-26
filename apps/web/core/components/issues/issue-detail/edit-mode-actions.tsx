/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@plane/propel/button";
import { EditIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
// hooks
import type { TIssueEditSession } from "@/hooks/use-issue-edit-session";

type Props = {
  session: TIssueEditSession;
  /** 有编辑权限且未归档才给「编辑」入口 */
  canEdit: boolean;
  className?: string;
};

/** 详情页路由 header 里「订阅」左边的空挂点，页面主体把编辑按钮 portal 进去 */
export const ISSUE_DETAIL_HEADER_EDIT_ACTIONS_ID = "issue-detail-header-edit-actions";

/** 详情页 / 抽屉共用的「编辑」与「保存 / 取消」按钮 */
export function IssueEditModeActions(props: Props) {
  const { session, canEdit, className } = props;
  if (!canEdit) return null;

  if (!session.isEditing) {
    return (
      <Button
        variant="secondary"
        size="lg"
        prependIcon={<EditIcon />}
        onClick={session.startEditing}
        className={className}
      >
        编辑
      </Button>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button variant="secondary" size="lg" onClick={session.cancel} disabled={session.isSaving}>
        取消
      </Button>
      <Button variant="primary" size="lg" onClick={() => void session.save()} loading={session.isSaving}>
        {session.isSaving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}

/**
 * 整页详情：把编辑按钮挂到路由 header 的挂点。
 * header 可能晚于页面主体出现（要等工作项加载出 project_id），也可能重挂，所以持续盯着 DOM 找挂点。
 */
export function IssueEditModeActionsPortal(props: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      const el = document.getElementById(ISSUE_DETAIL_HEADER_EDIT_ACTIONS_ID);
      setHost((prev) => (prev === el ? prev : el));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!host) return null;
  return createPortal(<IssueEditModeActions {...props} />, host);
}
