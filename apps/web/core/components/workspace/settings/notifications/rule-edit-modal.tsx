/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import type { TNotifyRule, TNotifyRuleMode } from "@/types/notify";

type Props = {
  /** 要编辑的规则；null = 弹窗关着 */
  rule: TNotifyRule | null;
  /** 「事件」一栏显示的全称，如「发布 · 计划时间调整」 */
  title: string;
  onClose: () => void;
  onSubmit: (rule: TNotifyRule, roles: Record<string, TNotifyRuleMode>) => Promise<void>;
};

const MODES: { value: TNotifyRuleMode; label: string }[] = [
  { value: "instant", label: "即时" },
  { value: "digest", label: "每日摘要" },
  { value: "none", label: "不发送" },
];
const GRID = "grid grid-cols-[minmax(0,1fr)_96px_96px_96px] items-center px-4";

/** 编辑通知规则：给这个事件的每个收件角色选「即时 / 每日摘要 / 不发送」 */
export function NotifyRuleEditModal({ rule, title, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState<Record<string, TNotifyRuleMode>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!rule) return;
    setDraft(Object.fromEntries(rule.roles.map((item) => [item.role, item.mode])));
    setError(null);
  }, [rule]);

  const roles = rule?.roles ?? [];
  const isDefault = roles.every((item) => (draft[item.role] ?? item.mode) === item.default_mode);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!rule) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(rule, draft);
      onClose();
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={rule !== null} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-18 font-semibold text-primary">编辑通知规则</h2>
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
      <form className="flex flex-col gap-5 px-5 py-5" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex flex-col gap-1.5">
          <span className="text-14 font-medium text-primary">事件</span>
          <div className="flex h-10 items-center rounded-md bg-layer-1 px-3 text-14 text-secondary">{title}</div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1 text-14 font-medium text-primary" id="notify-rule-matrix-label">
            邮件
            <span className="text-danger-primary">*</span>
          </span>
          <div
            className="overflow-hidden rounded-lg border border-subtle"
            role="table"
            aria-labelledby="notify-rule-matrix-label"
          >
            <div className={`${GRID} h-10 bg-layer-1 text-13 font-medium text-tertiary`} role="row">
              <span>收件角色</span>
              {MODES.map((mode) => (
                <span key={mode.value} className="text-center">
                  {mode.label}
                </span>
              ))}
            </div>
            {roles.map((item) => (
              <div key={item.role} className={`${GRID} h-11 border-t border-subtle text-14 text-primary`} role="row">
                <span>{item.label}</span>
                {MODES.map((mode) => (
                  <span key={mode.value} className="flex justify-center">
                    <input
                      type="radio"
                      className="size-4 cursor-pointer accent-accent-primary"
                      name={`notify-rule-${item.role}`}
                      aria-label={`${item.label} ${mode.label}`}
                      checked={(draft[item.role] ?? item.mode) === mode.value}
                      onChange={() => setDraft((current) => ({ ...current, [item.role]: mode.value }))}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            className="text-14 font-medium text-accent-primary hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline"
            disabled={isDefault || isSubmitting}
            onClick={() => setDraft(Object.fromEntries(roles.map((item) => [item.role, item.default_mode])))}
          >
            恢复默认
          </button>
          <span className="flex-1" />
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            保存
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
