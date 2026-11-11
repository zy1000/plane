/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { DATA_DICTIONARY_COLOR_KEYS, DEFAULT_DATA_DICTIONARY_COLOR } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TJobRole, TJobRoleLabelUsage } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { DictionaryColorDot } from "@/components/data-dictionaries";
import { getJobRoleErrorMessage, useJobRoleLabelUsage } from "@/hooks/store/use-workspace-job-roles";
import { JobRoleTag } from "./job-role-tag";

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  /** null = 新建 */
  role: TJobRole | null;
  onClose: () => void;
  onSubmit: (payload: { label: string; color: string }) => Promise<unknown>;
};

const INPUT =
  "h-10 w-full rounded-lg border border-subtle-1 bg-layer-2 px-3 text-14 text-primary outline-none transition-colors placeholder:text-placeholder focus:border-accent-strong";

/** 新建 / 编辑角色：名称 + 颜色。编辑时改了名称，提示哪些地方按名字引用它（只提示，不拦保存） */
export function JobRoleFormModal(props: Props) {
  const { isOpen, workspaceSlug, role, onClose, onSubmit } = props;
  const { t } = useTranslation();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_DATA_DICTIONARY_COLOR);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const labelUsage = useJobRoleLabelUsage(isOpen ? workspaceSlug : undefined, isOpen && role ? role.id : null);
  const isEdit = Boolean(role);

  useEffect(() => {
    if (!isOpen) return;
    setLabel(role?.label ?? "");
    setColor(role?.color || DEFAULT_DATA_DICTIONARY_COLOR);
    setNameError(null);
    setError(null);
  }, [isOpen, role]);

  const trimmed = label.trim();
  const isRenamed = isEdit && trimmed !== "" && trimmed !== role?.label;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed) return setNameError("请填写角色名称");
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ label: trimmed, color });
    } catch (submitError) {
      const message = getJobRoleErrorMessage(submitError, "");
      if (message) setNameError(message);
      else setError("保存失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-18 font-semibold text-primary">{isEdit ? "编辑角色" : "新建角色"}</h2>
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
      <form className="flex flex-col gap-5 px-5 py-5" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1 text-14 font-medium text-primary" htmlFor="job-role-label">
            角色名称
            <span className="text-danger-primary">*</span>
          </label>
          <input
            id="job-role-label"
            className={cn(INPUT, nameError && "border-danger-strong focus:border-danger-strong")}
            maxLength={255}
            value={label}
            placeholder="请输入角色名称"
            autoFocus
            onChange={(event) => {
              setLabel(event.target.value);
              if (nameError) setNameError(null);
            }}
          />
          {nameError && <p className="text-11 leading-4 text-danger-primary">{nameError}</p>}
          {isRenamed && <p className="text-13 text-tertiary">原名称：{role?.label}</p>}
          {isRenamed && labelUsage && <RenameImpact workspaceSlug={workspaceSlug} usage={labelUsage} />}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-14 font-medium text-primary">颜色</span>
          <div className="flex flex-wrap items-center gap-2.5" role="radiogroup" aria-label="颜色">
            {DATA_DICTIONARY_COLOR_KEYS.map((key) => {
              const isSelected = color === key;
              const name = t(`workspace_settings.settings.data_dictionaries.colors.${key}`);
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={name}
                  title={name}
                  className={cn(
                    "grid size-8 place-items-center rounded-full transition-shadow",
                    isSelected
                      ? "shadow-[0_0_0_2px_var(--background-color-surface-1),0_0_0_4px_var(--border-color-accent-strong)]"
                      : "hover:bg-layer-1-hover"
                  )}
                  onClick={() => setColor(key)}
                >
                  <DictionaryColorDot color={key} size="lg" />
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2.5 text-13 text-tertiary">
            预览
            <JobRoleTag role={{ label: trimmed || "角色名称", color }} />
          </div>
        </div>

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            确定
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

/** 改名提示：评审模板 / 未完成的评审是按角色名字匹配人员的 */
function RenameImpact({ workspaceSlug, usage }: { workspaceSlug: string; usage: TJobRoleLabelUsage }) {
  if (usage.review_template_count === 0 && usage.open_review_count === 0) return null;
  const { initiator_role, leader_role, auditor_role } = usage.review_templates;
  const templateParts = [
    initiator_role > 0 ? `发起者 ${initiator_role}` : null,
    leader_role > 0 ? `主导者 ${leader_role}` : null,
    auditor_role > 0 ? `审核者 ${auditor_role}` : null,
  ].filter(Boolean);

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg border border-warning-subtle bg-warning-subtle px-3.5 py-3" role="status">
      <p className="flex items-start gap-2 text-13 leading-5 text-warning-primary">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        以下位置按名称匹配该角色，改名后将无法匹配人员，需同步修改。
      </p>
      <div className="flex flex-col divide-y divide-subtle text-13">
        {usage.review_template_count > 0 && (
          <div className="flex items-center gap-3 py-2">
            <span className="text-secondary">
              评审模板
              <span className="ml-1.5 text-12 text-tertiary">{templateParts.join(" · ")}</span>
            </span>
            <span className="ml-auto font-medium whitespace-nowrap text-primary tabular-nums">
              {usage.review_template_count} 处
            </span>
            <a
              href={`/${workspaceSlug}/templates/reviews`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary hover:underline"
            >
              查看
            </a>
          </div>
        )}
        {usage.open_review_count > 0 && (
          <div className="flex items-center gap-3 py-2">
            <span className="text-secondary">未完成的评审</span>
            <span className="ml-auto font-medium whitespace-nowrap text-primary tabular-nums">
              {usage.open_review_count} 个
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
