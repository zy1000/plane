/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { getPermissionGroupErrorMessage } from "./helpers";

type Props = {
  group: IPermissionGroup | null;
  onClose: () => void;
  onConfirm: (group: IPermissionGroup) => Promise<void>;
};

/** 删除确认：写清影响范围（多少人失去这组权限 / 多少项目在引用这个模板） */
export function DeletePermissionGroupModal({ group, onClose, onConfirm }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTemplate = Boolean(group?.is_template);
  const impact = !group
    ? ""
    : [
        group.member_count > 0
          ? `组里的 ${group.member_count} 名成员将失去这个权限组给的权限（通过团队获得的也一并失去）。`
          : "组里目前没有成员。",
        isTemplate
          ? (group.referenced_project_count ?? 0) > 0
            ? `有 ${group.referenced_project_count} 个项目正在引用这个模板，删除后这些项目里的这个权限组一并消失，绑到它上面的人解绑。`
            : "目前没有项目引用这个模板。"
          : null,
      ]
        .filter(Boolean)
        .join(" ");

  const handleSubmit = async () => {
    if (!group) return;
    setIsSubmitting(true);
    try {
      await onConfirm(group);
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已删除「${group.name}」` });
      onClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: getPermissionGroupErrorMessage(error, "请稍后重试"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={Boolean(group)}
      handleClose={onClose}
      handleSubmit={handleSubmit}
      isSubmitting={isSubmitting}
      title={`删除权限组「${group?.name ?? ""}」？`}
      content={
        <>
          {impact}
          <br />
          删除后不能恢复。
        </>
      }
      primaryButtonText={{ loading: "删除中", default: "删除" }}
    />
  );
}
