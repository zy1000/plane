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
import { NotifyModeRadioCards } from "@/components/notify";
import type { TMySubscription, TNotifyMode } from "@/types/notify";

type Props = {
  subscription: TMySubscription | null;
  onClose: () => void;
  onSubmit: (subscription: TMySubscription, mode: TNotifyMode) => Promise<void>;
};

/** 我的订阅 › 编辑：改这一条订阅的接收方式 */
export function MySubscriptionModeModal({ subscription, onClose, onSubmit }: Props) {
  const [mode, setMode] = useState<TNotifyMode>("digest");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!subscription) return;
    setMode(subscription.mode);
    setError(null);
  }, [subscription]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!subscription) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(subscription, mode);
      onClose();
    } catch {
      setError("保存失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={subscription !== null} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex items-center justify-between border-b border-subtle px-5 py-4">
        <h2 className="text-18 font-semibold text-primary">编辑订阅</h2>
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
          <span className="text-14 font-medium text-primary">订阅对象</span>
          <div className="flex min-h-9 items-center rounded-md bg-layer-1 px-3 py-1.5 text-14 text-secondary">
            {subscription ? `${subscription.code} ${subscription.name}`.trim() : ""}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1 text-14 font-medium text-primary" id="my-subscription-mode-label">
            接收方式
            <span className="text-danger-primary">*</span>
          </span>
          <NotifyModeRadioCards value={mode} onChange={setMode} labelledBy="my-subscription-mode-label" />
        </div>
        {error && <p className="text-11 leading-4 text-danger-primary">{error}</p>}
        <div className="mt-1 flex items-center justify-end gap-2">
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
