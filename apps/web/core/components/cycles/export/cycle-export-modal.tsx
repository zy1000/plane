/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useEffect, useMemo, useState } from "react";
import { Checkbox, Modal, Radio, Space, message } from "antd";
// services
import { IssueService } from "@/services/issue";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
// local
import {
  DEFAULT_EXPORT_FIELDS,
  EXPORT_FIELD_GROUPS,
  EXPORT_FIELD_ITEMS,
  EXPORT_FORMAT_OPTIONS,
  type TExportFormat,
} from "@/components/issues/export/constants";
import { downloadBlob } from "@/components/issues/export/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

const DEFAULT_FIELDS_WITH_ESTIMATE = Array.from(new Set([...DEFAULT_EXPORT_FIELDS, "estimate"]));

export const CycleExportModal: React.FC<Props> = observer((props) => {
  const { open, onClose, workspaceSlug, projectId } = props;
  const { getProjectCycleDetails } = useCycle();

  const cycleOptions = useMemo(() => {
    const cycleDetails = getProjectCycleDetails(projectId) ?? [];
    return cycleDetails.map((cycle) => ({
      id: cycle.id,
      name: cycle.name,
    }));
  }, [getProjectCycleDetails, projectId]);

  const allCycleIds = useMemo(() => cycleOptions.map((cycle) => cycle.id), [cycleOptions]);
  const allFieldKeys = useMemo(() => EXPORT_FIELD_ITEMS.map((field) => field.key), []);
  const itemsByGroup = useMemo(() => {
    const map = new Map<string, typeof EXPORT_FIELD_ITEMS>();
    for (const item of EXPORT_FIELD_ITEMS) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)?.push(item);
    }
    return map;
  }, []);

  const [selectedCycleIds, setSelectedCycleIds] = useState<string[]>([]);
  const [format, setFormat] = useState<TExportFormat>("xlsx");
  const [fields, setFields] = useState<string[]>(DEFAULT_FIELDS_WITH_ESTIMATE);
  const [submitting, setSubmitting] = useState(false);

  const allCyclesChecked = allCycleIds.length > 0 && selectedCycleIds.length === allCycleIds.length;
  const cycleIndeterminate = selectedCycleIds.length > 0 && selectedCycleIds.length < allCycleIds.length;
  const allFieldsChecked = fields.length === allFieldKeys.length;
  const fieldIndeterminate = fields.length > 0 && fields.length < allFieldKeys.length;

  useEffect(() => {
    if (!open) return;
    setSelectedCycleIds(allCycleIds);
    setFields(DEFAULT_FIELDS_WITH_ESTIMATE);
    setFormat("xlsx");
  }, [open, allCycleIds]);

  const toggleAllCycles = (checked: boolean) => {
    setSelectedCycleIds(checked ? [...allCycleIds] : []);
  };

  const toggleAllFields = (checked: boolean) => {
    setFields(checked ? [...allFieldKeys] : []);
  };

  const issueService = useMemo(() => new IssueService(), []);

  const handleExport = async () => {
    if (selectedCycleIds.length === 0) {
      message.warning("请至少选择一个迭代");
      return;
    }
    if (fields.length === 0) {
      message.warning("请至少勾选一个导出字段");
      return;
    }

    setSubmitting(true);
    try {
      const { blob, filename } = await issueService.exportIssues(workspaceSlug, projectId, {
        scope: "cycles",
        cycle_ids: selectedCycleIds,
        fields,
        format,
      });
      downloadBlob(blob, filename);
      message.success("导出成功");
      onClose();
    } catch (err: unknown) {
      const errObj = err as { error?: string; message?: string } | undefined;
      console.error(err);
      message.error(errObj?.error || errObj?.message || "导出失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="导出迭代工作项"
      open={open}
      onCancel={submitting ? undefined : onClose}
      onOk={handleExport}
      okText="开始导出"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnClose
      width={680}
      maskClosable={!submitting}
    >
      <div className="flex flex-col gap-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">选择迭代</div>
            <Checkbox
              indeterminate={cycleIndeterminate}
              checked={allCyclesChecked}
              onChange={(event) => toggleAllCycles(event.target.checked)}
            >
              全选
            </Checkbox>
          </div>
          <div className="max-h-52 overflow-auto rounded border border-subtle p-3">
            {cycleOptions.length > 0 ? (
              <Checkbox.Group
                value={selectedCycleIds}
                onChange={(val) => setSelectedCycleIds(val as string[])}
                className="w-full"
              >
                <div className="grid grid-cols-2 gap-y-2">
                  {cycleOptions.map((cycle) => (
                    <Checkbox key={cycle.id} value={cycle.id}>
                      {cycle.name}
                    </Checkbox>
                  ))}
                </div>
              </Checkbox.Group>
            ) : (
              <div className="text-sm text-secondary">暂无可导出的迭代</div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">导出字段</div>
            <Checkbox
              indeterminate={fieldIndeterminate}
              checked={allFieldsChecked}
              onChange={(event) => toggleAllFields(event.target.checked)}
            >
              全选
            </Checkbox>
          </div>
          <div className="max-h-72 overflow-auto rounded border border-subtle p-3">
            <Checkbox.Group value={fields} onChange={(val) => setFields(val as string[])} className="w-full">
              <div className="flex flex-col gap-3">
                {EXPORT_FIELD_GROUPS.map((group) => {
                  const items = itemsByGroup.get(group) || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="mb-1 text-xs text-secondary">{group}</div>
                      <div className="grid grid-cols-3 gap-y-1">
                        {items.map((item) => (
                          <Checkbox key={item.key} value={item.key}>
                            {item.label}
                          </Checkbox>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Checkbox.Group>
          </div>
        </section>

        <section>
          <div className="mb-2 text-sm font-medium">导出格式</div>
          <Radio.Group value={format} onChange={(event) => setFormat(event.target.value)}>
            <Space>
              {EXPORT_FORMAT_OPTIONS.map((option) => (
                <Radio key={option.value} value={option.value}>
                  {option.label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </section>
      </div>
    </Modal>
  );
});

CycleExportModal.displayName = "CycleExportModal";
