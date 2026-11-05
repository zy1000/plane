/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { PERMISSION_GROUP_KIND_LABELS, getPermissionGroupErrorMessage } from "./helpers";

type Props = {
  group: IPermissionGroup | null;
  onClose: () => void;
  onConfirm: (group: IPermissionGroup) => Promise<void>;
};

/** 按类型写影响范围：工作区组 → 多少人失去权限；模板 → 多少项目在引用；数据权限 → 多少人失去可见范围 */
const describeImpact = (group: IPermissionGroup) => {
  switch (group.kind) {
    case "project_template":
      return (group.referenced_project_count ?? 0) > 0
        ? `有 ${group.referenced_project_count} 个项目正在引用这个模板，删除后这些项目里的这个权限组一并消失，引用它的项目里绑定的成员会解绑。`
        : "目前没有项目引用这个模板。";
    case "data":
      return group.member_count > 0
        ? `组内的 ${group.member_count} 名成员会失去这些项目 / 产品的可见范围（通过团队获得的也一并失去）。`
        : "组里目前没有成员。";
    default:
      return group.member_count > 0
        ? `组里的 ${group.member_count} 名成员将失去这个权限组给的权限（通过团队获得的也一并失去）。`
        : "组里目前没有成员。";
  }
};

/** 删除确认：写清影响范围 */
export function DeletePermissionGroupModal({ group, onClose, onConfirm }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      title={`删除${group ? PERMISSION_GROUP_KIND_LABELS[group.kind] : "权限组"}「${group?.name ?? ""}」？`}
      content={
        <>
          {group ? describeImpact(group) : ""}
          <br />
          删除后不能恢复。
        </>
      }
      primaryButtonText={{ loading: "删除中", default: "删除" }}
    />
  );
}
