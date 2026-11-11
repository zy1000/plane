/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TJobRoleOption } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { ModalFieldError, ModalFieldLabel } from "@/components/common/form-modal";
import { OptionMultiSelect } from "@/components/permission-groups";
import { PermissionGroupSegmented } from "@/components/workspace/settings/permission-groups/ui";
import { errorMessage } from "../permission-groups/shared";
import { buildJobRoleOptions } from "./helpers";

export type TBulkJobRoleMode = "append" | "replace";

type Props = {
  isOpen: boolean;
  /** 勾选了多少名成员 */
  memberCount: number;
  jobRoles: TJobRoleOption[];
  onClose: () => void;
  onSubmit: (data: { job_role_ids: string[]; mode: TBulkJobRoleMode }) => Promise<void>;
};

const MODE_HINT: Record<TBulkJobRoleMode, string> = {
  append: "保留各成员原有角色，并加上所选角色。",
  replace: "各成员在本项目的角色改为所选角色；不选角色即清空。",
};

/** 成员表批量「设置角色」：给勾选的成员追加角色，或整份替换他们在本项目的角色 */
export function BulkJobRoleModal({ isOpen, memberCount, jobRoles, onClose, onSubmit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [jobRoleIds, setJobRoleIds] = useState<string[]>([]);
  const [mode, setMode] = useState<TBulkJobRoleMode>("append");
  const [roleError, setRoleError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setJobRoleIds([]);
    setMode("append");
    setRoleError(undefined);
  }, [isOpen]);

  const handleSubmit = async () => {
    if (mode === "append" && jobRoleIds.length === 0) {
      setRoleError("请选择角色");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({ job_role_ids: jobRoleIds, mode });
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已为 ${memberCount} 名成员设置角色` });
      onClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "设置失败", message: errorMessage(error, "请稍后重试") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div ref={containerRef} className="flex flex-col">
        <div className="border-b border-subtle px-6 py-4">
          <h3 className="text-16 font-medium text-primary">设置角色</h3>
          <p className="mt-0.5 text-13 text-tertiary">已选 {memberCount} 名成员</p>
        </div>
        <div className="flex flex-col gap-5 px-6 py-5">
          <div>
            <ModalFieldLabel required={mode === "append"}>角色</ModalFieldLabel>
            <OptionMultiSelect
              options={buildJobRoleOptions(jobRoles)}
              value={jobRoleIds}
              onChange={(value) => {
                setJobRoleIds(value);
                setRoleError(undefined);
              }}
              placeholder="选择角色"
              searchPlaceholder="搜索角色"
              portalContainerRef={containerRef}
            />
            <ModalFieldError message={roleError} />
          </div>
          <div>
            <ModalFieldLabel>设置方式</ModalFieldLabel>
            <PermissionGroupSegmented<TBulkJobRoleMode>
              items={[
                { key: "append", label: "追加" },
                { key: "replace", label: "替换原有角色" },
              ]}
              value={mode}
              onChange={(next) => {
                setMode(next);
                setRoleError(undefined);
              }}
              size="lg"
            />
            <p className="mt-2 text-13 text-tertiary">{MODE_HINT[mode]}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-subtle px-6 py-4">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" loading={isSubmitting} onClick={() => void handleSubmit()}>
            确定
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
