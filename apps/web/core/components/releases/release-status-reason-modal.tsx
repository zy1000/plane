/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useState } from "react";
import { DatePicker, Input, Modal } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { TReleaseStatus } from "@plane/types";
import { getReleaseStatusDetails } from "./release-status-config";

const REASON_MAX_LENGTH = 1000;

type Props = {
  open: boolean;
  nextStatus: TReleaseStatus | null;
  loading?: boolean;
  currentTestHandoffDate: string | null;
  releaseStartDate: string | null;
  releaseTargetDate: string | null;
  onCancel: () => void;
  onConfirm: (reason: string, testHandoffDate?: string | null) => void;
};

export function ReleaseStatusReasonModal(props: Props) {
  const { open, nextStatus, loading, currentTestHandoffDate, releaseStartDate, releaseTargetDate, onCancel, onConfirm } =
    props;
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [testHandoffDate, setTestHandoffDate] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
      setTestHandoffDate(currentTestHandoffDate ?? null);
    }
  }, [open, currentTestHandoffDate]);

  const trimmed = reason.trim();
  const isInvalid = touched && trimmed.length === 0;
  const statusLabel = nextStatus ? getReleaseStatusDetails(nextStatus).label : "";
  const showTestHandoffDate = nextStatus === "rejected";

  const startDate = releaseStartDate ? dayjs(releaseStartDate) : null;
  const targetDate = releaseTargetDate ? dayjs(releaseTargetDate) : null;

  const handleOk = () => {
    setTouched(true);
    if (trimmed.length === 0) return;
    onConfirm(trimmed, showTestHandoffDate ? testHandoffDate : undefined);
  };

  const handleDisableOutOfRangeDate = (current: Dayjs) => {
    if (startDate && current.isBefore(startDate, "day")) return true;
    if (targetDate && current.isAfter(targetDate, "day")) return true;
    return false;
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
      destroyOnHidden
      maskClosable={!loading}
      width={720}
    >
      <div className="space-y-4 py-2">
        {showTestHandoffDate && (
          <div className="space-y-2">
            <div className="text-sm text-secondary">转测日期</div>
            <DatePicker
              className="w-full"
              value={testHandoffDate ? dayjs(testHandoffDate) : null}
              onChange={(value) => setTestHandoffDate(value ? value.format("YYYY-MM-DD") : null)}
              placeholder="请选择转测日期"
              allowClear={false}
              disabledDate={handleDisableOutOfRangeDate}
              disabled={loading}
            />
          </div>
        )}
        <div className="space-y-2">
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
      </div>
    </Modal>
  );
}
