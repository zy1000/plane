/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { DatePicker, Modal } from "antd";
import dayjs, { type Dayjs } from "dayjs";

export type TTestingDatesConfirmPayload = {
  endDate: string;
  testHandoffDate: string;
};

type Props = {
  open: boolean;
  loading?: boolean;
  entityLabel: string;
  targetStatusLabel: string;
  startDate: string | null;
  endDate: string | null;
  testHandoffDate: string | null;
  onCancel: () => void;
  onConfirm: (payload: TTestingDatesConfirmPayload) => void;
};

const DATE_FORMAT = "YYYY-MM-DD";

const normalizeDate = (value?: string | null): string | null => {
  if (!value) return null;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return null;
  return parsed.format(DATE_FORMAT);
};

const toDayjs = (value: string | null): Dayjs | null => (value ? dayjs(value) : null);

export function TestingDatesConfirmModal(props: Props) {
  const { open, loading, entityLabel, targetStatusLabel, startDate, endDate, testHandoffDate, onCancel, onConfirm } =
    props;
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null);
  const [selectedTestHandoffDate, setSelectedTestHandoffDate] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedEndDate(normalizeDate(endDate));
    setSelectedTestHandoffDate(normalizeDate(testHandoffDate));
  }, [open, endDate, testHandoffDate]);

  const normalizedStartDate = useMemo(() => normalizeDate(startDate), [startDate]);
  const startDateValue = toDayjs(normalizedStartDate);
  const endDateValue = toDayjs(selectedEndDate);
  const testHandoffDateValue = toDayjs(selectedTestHandoffDate);

  const validationMessage = useMemo(() => {
    if (!endDateValue) return "请选择结束日期";
    if (!testHandoffDateValue) return "请选择转测日期";
    if (startDateValue && endDateValue.isBefore(startDateValue, "day")) return "结束日期不能早于开始日期";
    if (startDateValue && testHandoffDateValue.isBefore(startDateValue, "day")) return "转测日期不能早于开始日期";
    if (testHandoffDateValue.isAfter(endDateValue, "day")) return "转测日期不能晚于结束日期";
    return null;
  }, [endDateValue, startDateValue, testHandoffDateValue]);

  const handleDisableEndDate = (current: Dayjs) => {
    if (startDateValue && current.isBefore(startDateValue, "day")) return true;
    return false;
  };

  const handleDisableTestHandoffDate = (current: Dayjs) => {
    if (startDateValue && current.isBefore(startDateValue, "day")) return true;
    if (endDateValue && current.isAfter(endDateValue, "day")) return true;
    return false;
  };

  const handleOk = () => {
    if (validationMessage || !selectedEndDate || !selectedTestHandoffDate) return;
    onConfirm({
      endDate: selectedEndDate,
      testHandoffDate: selectedTestHandoffDate,
    });
  };

  return (
    <Modal
      title={`将${entityLabel}状态改为「${targetStatusLabel}」`}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ loading, disabled: !!validationMessage }}
      destroyOnClose
      maskClosable={!loading}
      width={560}
    >
      <div className="space-y-4 py-2">
        <p className="text-sm text-secondary">请重新确认结束日期和转测日期。</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm text-secondary">结束日期</div>
            <DatePicker
              className="w-full"
              value={endDateValue}
              onChange={(value) => setSelectedEndDate(value ? value.format(DATE_FORMAT) : null)}
              placeholder="请选择结束日期"
              allowClear={false}
              disabledDate={handleDisableEndDate}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <div className="text-sm text-secondary">转测日期</div>
            <DatePicker
              className="w-full"
              value={testHandoffDateValue}
              onChange={(value) => setSelectedTestHandoffDate(value ? value.format(DATE_FORMAT) : null)}
              placeholder="请选择转测日期"
              allowClear={false}
              disabledDate={handleDisableTestHandoffDate}
              disabled={loading}
            />
          </div>
        </div>
        {validationMessage && <div className="text-sm text-danger-primary">{validationMessage}</div>}
      </div>
    </Modal>
  );
}
