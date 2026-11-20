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
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { TNotifyMode, TNotifySubscriber } from "@/types/notify";
import { NotifyModeRadioCards } from "./mode-radio-cards";

type Props = {
  isOpen: boolean;
  projectId: string;
  /** 传了就是编辑这个人的接收方式；不传是添加 */
  subscriber?: TNotifySubscriber | null;
  /** 已经是订阅人的用户，添加时不再可选 */
  existingIds: string[];
  onClose: () => void;
  onSubmit: (subscriberIds: string[], mode: TNotifyMode) => Promise<void>;
};

/** 添加订阅人 / 编辑接收方式。添加时可一次选多人，接收方式默认「每日摘要」 */
export function NotifySubscriberFormModal(props: Props) {
  const { isOpen, projectId, subscriber, existingIds, onClose, onSubmit } = props;
  const isEdit = Boolean(subscriber);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [mode, setMode] = useState<TNotifyMode>("digest");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMemberIds([]);
    setMode(subscriber?.mode ?? "digest");
    setError(null);
  }, [isOpen, subscriber]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const ids = subscriber ? [subscriber.subscriber_id] : memberIds.filter((id) => !existingIds.includes(id));
    if (ids.length === 0) return setError(memberIds.length > 0 ? "所选人员已是订阅人" : "请选择订阅人");
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(ids, mode);
      onClose();
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-18 font-semibold text-primary">{isEdit ? "编辑订阅人" : "添加订阅人"}</h2>
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
          <span className="flex items-center gap-1 text-14 font-medium text-primary">
            订阅人
            <span className="text-danger-primary">*</span>
          </span>
          {subscriber ? (
            <div className="flex h-9 items-center rounded-md bg-layer-1 px-3 text-14 text-secondary">
              {subscriber.display_name}
            </div>
          ) : (
            <div className="h-9">
              <MemberDropdown
                value={memberIds}
                onChange={(value: string[]) => {
                  setMemberIds(value);
                  if (error) setError(null);
                }}
                projectId={projectId}
                multiple
                buttonVariant="border-with-text"
                buttonContainerClassName="w-full text-left"
                buttonClassName="h-9 w-full justify-between"
                placeholder="请选择订阅人"
                showUserDetails
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1 text-14 font-medium text-primary" id="notify-mode-label">
            接收方式
            <span className="text-danger-primary">*</span>
          </span>
          <NotifyModeRadioCards value={mode} onChange={setMode} labelledBy="notify-mode-label" />
        </div>

        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" type="button" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" type="submit" loading={isSubmitting}>
            {isEdit ? "保存" : "添加"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
