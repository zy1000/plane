/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import type { IPermissionGroup, IWorkspaceMember, TDataDictionaryItem } from "@plane/types";
import { Checkbox, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { MemberIdentityCell } from "./permission-groups/member-identity-cell";

export type TMemberAccessValue = { job_role_ids: string[]; custom_role_ids: string[] };

type Props = {
  member: IWorkspaceMember | null;
  jobRoles: TDataDictionaryItem[];
  /** 工作区权限组 */
  groups: IPermissionGroup[];
  /** 通过团队拿到的组名，只读展示 */
  teamGroupNames: string[];
  onClose: () => void;
  onSubmit: (value: TMemberAccessValue) => Promise<void>;
};

type TOption = { id: string; label: string; hint?: string };

/** 带搜索的勾选清单：角色几十个、权限组几个，平铺比下拉好挑 */
function CheckList(props: { options: TOption[]; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const { options, value, onChange, placeholder } = props;
  const [query, setQuery] = useState("");
  const picked = new Set(value);
  const keyword = query.trim().toLowerCase();
  const visible = keyword ? options.filter((option) => option.label.toLowerCase().includes(keyword)) : options;
  return (
    <div className="overflow-hidden rounded-md border border-subtle-1">
      {options.length > 8 && (
        <div className="flex h-8 items-center gap-1.5 border-b border-subtle bg-layer-2 px-2.5">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      <div className="max-h-48 overflow-y-auto py-1">
        {visible.length === 0 ? (
          <p className="px-3 py-2 text-12 text-placeholder">没有可选项</p>
        ) : (
          visible.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-13 text-primary hover:bg-layer-1-hover"
            >
              <Checkbox
                checked={picked.has(option.id)}
                onChange={() =>
                  onChange(picked.has(option.id) ? value.filter((id) => id !== option.id) : [...value, option.id])
                }
              />
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint && <span className="shrink-0 text-11 text-tertiary">{option.hint}</span>}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 编辑成员（成员表「编辑」）：角色（找人用，与权限无关）+ 权限组（决定能做什么）。
 * 团队带来的组在团队页改，这里只读列出来。
 */
export function MemberAccessModal(props: Props) {
  const { member, jobRoles, groups, teamGroupNames, onClose, onSubmit } = props;
  const [value, setValue] = useState<TMemberAccessValue>({ job_role_ids: [], custom_role_ids: [] });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!member) return;
    setValue({ job_role_ids: member.job_role_ids ?? [], custom_role_ids: member.custom_role_ids ?? [] });
    setError(null);
  }, [member]);

  const jobRoleOptions = useMemo(() => jobRoles.map((item) => ({ id: item.id, label: item.label })), [jobRoles]);
  const groupOptions = useMemo(() => groups.map((group) => ({ id: group.id, label: group.name })), [groups]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (submitError) {
      const payload = submitError as { error?: string; custom_role_ids?: string[]; job_role_ids?: string[] } | undefined;
      setError(payload?.error ?? payload?.custom_role_ids?.[0] ?? payload?.job_role_ids?.[0] ?? "保存失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={Boolean(member)} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-14 font-medium text-primary">编辑成员</h2>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover disabled:opacity-50"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">
        <MemberIdentityCell user={member?.member} />

        <div className="flex flex-col gap-1.5">
          <span className="text-12 font-medium text-secondary">角色</span>
          <p className="text-11 leading-4 text-tertiary">他是干什么的。审批人、评审负责人按角色找人，不决定权限。</p>
          <CheckList
            options={jobRoleOptions}
            value={value.job_role_ids}
            onChange={(jobRoleIds) => setValue((current) => ({ ...current, job_role_ids: jobRoleIds }))}
            placeholder="搜索角色"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-12 font-medium text-secondary">权限组</span>
          <p className="text-11 leading-4 text-tertiary">
            他能做什么。
            {teamGroupNames.length > 0 && `通过团队还有：${teamGroupNames.join("、")}（在团队页调整）。`}
          </p>
          <CheckList
            options={groupOptions}
            value={value.custom_role_ids}
            onChange={(groupIds) => setValue((current) => ({ ...current, custom_role_ids: groupIds }))}
            placeholder="搜索权限组"
          />
        </div>

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" type="button" loading={isSubmitting} onClick={() => void handleSubmit()}>
            保存
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
