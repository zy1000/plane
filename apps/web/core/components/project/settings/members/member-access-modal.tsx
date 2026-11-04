/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TJobRoleOption, TProjectPermissionGroup } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { ModalFieldLabel } from "@/components/common/form-modal";
import { OptionMultiSelect } from "@/components/permission-groups";
import { errorMessage } from "../permission-groups/shared";
import { buildGroupOptions, buildJobRoleOptions } from "./helpers";
import type { TProjectMemberRow } from "./use-project-members-table";

type Props = {
  row: TProjectMemberRow | null;
  groups: TProjectPermissionGroup[];
  jobRoles: TJobRoleOption[];
  onClose: () => void;
  onSubmit: (row: TProjectMemberRow, data: { custom_role_ids: string[]; job_role_ids: string[] }) => Promise<void>;
};

/** 成员表「编辑」：整份替换这个人在本项目的角色与权限组 */
export function ProjectMemberAccessModal({ row, groups, jobRoles, onClose, onSubmit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [jobRoleIds, setJobRoleIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!row) return;
    setJobRoleIds(row.jobRoleIds);
    setGroupIds(row.groupIds);
  }, [row]);

  const handleSubmit = async () => {
    if (!row) return;
    setIsSubmitting(true);
    try {
      await onSubmit(row, { custom_role_ids: groupIds, job_role_ids: jobRoleIds });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存" });
      onClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: errorMessage(error, "请稍后重试") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={Boolean(row)} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div ref={containerRef} className="flex flex-col">
        <div className="border-b border-subtle px-6 py-4">
          <h3 className="text-16 font-medium text-primary">编辑成员</h3>
          <p className="mt-0.5 text-13 text-tertiary">{row?.user.display_name}</p>
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">
          <div>
            <ModalFieldLabel note="只用来找人（审批人、评审负责人），与权限无关">角色</ModalFieldLabel>
            <OptionMultiSelect
              options={buildJobRoleOptions(jobRoles)}
              value={jobRoleIds}
              onChange={setJobRoleIds}
              placeholder="选择角色"
              searchPlaceholder="搜索角色"
              portalContainerRef={containerRef}
            />
          </div>
          <div>
            <ModalFieldLabel note="决定能做什么">权限组</ModalFieldLabel>
            <OptionMultiSelect
              options={buildGroupOptions(groups)}
              value={groupIds}
              onChange={setGroupIds}
              tone="accent"
              placeholder="选择权限组"
              searchPlaceholder="搜索权限组"
              portalContainerRef={containerRef}
            />
          </div>
          {row && row.inheritedSources.length > 0 && (
            <p className="text-12 text-tertiary">
              另外通过团队继承：
              {row.inheritedSources.map((source) => `${source.role.name}（${source.group?.name ?? "团队"}）`).join("、")}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-6 py-4">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" loading={isSubmitting} onClick={() => void handleSubmit()}>
            保存
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
