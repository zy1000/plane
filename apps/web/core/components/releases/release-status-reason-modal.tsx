/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { Input, Modal } from "antd";
import type { TReleaseStatus } from "@plane/types";
import { getReleaseStatusDetails } from "./release-status-config";

const REASON_MAX_LENGTH = 1000;

type Props = {
  open: boolean;
  nextStatus: TReleaseStatus | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

export function ReleaseStatusReasonModal(props: Props) {
  const { open, nextStatus, loading, onCancel, onConfirm } = props;
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const isInvalid = touched && trimmed.length === 0;
  const statusLabel = nextStatus ? getReleaseStatusDetails(nextStatus).label : "";

  const handleOk = () => {
    setTouched(true);
    if (trimmed.length === 0) return;
    onConfirm(trimmed);
  };

  return (
    <Modal
      title={`将状态改为「${statusLabel}」`}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ loading, disabled: trimmed.length === 0 }}
      destroyOnClose
      maskClosable={!loading}
      width={720}
    >
      <div className="space-y-2 py-2">
        <div className="text-sm text-secondary">请填写原因（必填，最长 {REASON_MAX_LENGTH} 字）</div>
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          autoSize={{ minRows: 14, maxRows: 40 }}
          maxLength={REASON_MAX_LENGTH}
          showCount
          placeholder="请输入原因"
          status={isInvalid ? "error" : undefined}
        />
        {isInvalid && <div className="text-sm text-danger-primary">原因不能为空</div>}
      </div>
    </Modal>
  );
}
