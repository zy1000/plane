/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

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
