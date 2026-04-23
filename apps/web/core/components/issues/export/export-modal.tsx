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
// local
import {
  DEFAULT_EXPORT_FIELDS,
  EXPORT_FIELD_GROUPS,
  EXPORT_FIELD_ITEMS,
  EXPORT_FORMAT_OPTIONS,
  type TExportFormat,
} from "./constants";
import { downloadBlob } from "./utils";

type TExportScope = "selected" | "filtered";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  /** 当前多选命中的 issue id 列表。 */
  selectedIds: string[];
  /** 当前已应用的筛选参数（query string，不含问号），用于 scope=filtered 时透传给后端。 */
  filteredQueryString?: string;
};

export const IssueExportModal: React.FC<Props> = observer((props) => {
  const { open, onClose, workspaceSlug, projectId, selectedIds, filteredQueryString } = props;

  const hasSelection = selectedIds.length > 0;

  const [scope, setScope] = useState<TExportScope>(hasSelection ? "selected" : "filtered");
  const [format, setFormat] = useState<TExportFormat>("xlsx");
  const [fields, setFields] = useState<string[]>(DEFAULT_EXPORT_FIELDS);
  const [submitting, setSubmitting] = useState(false);

  // 打开弹窗时根据当前勾选状态重置 scope 默认值
  useEffect(() => {
    if (open) {
      setScope(hasSelection ? "selected" : "filtered");
    }
  }, [open, hasSelection]);

  const allKeys = useMemo(() => EXPORT_FIELD_ITEMS.map((f) => f.key), []);
  const itemsByGroup = useMemo(() => {
    const map = new Map<string, typeof EXPORT_FIELD_ITEMS>();
    for (const item of EXPORT_FIELD_ITEMS) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return map;
  }, []);

  const allChecked = fields.length === allKeys.length;
  const indeterminate = fields.length > 0 && fields.length < allKeys.length;

  const toggleAll = (checked: boolean) => {
    setFields(checked ? [...allKeys] : []);
  };

  const issueService = useMemo(() => new IssueService(), []);

  const handleExport = async () => {
    if (fields.length === 0) {
      message.warning("请至少勾选一个导出字段");
      return;
    }
    if (scope === "selected" && selectedIds.length === 0) {
      message.warning("请先在列表中勾选工作项");
      return;
    }

    const payload = {
      scope,
      fields,
      format,
      ...(scope === "selected" ? { issue_ids: selectedIds } : {}),
    };

    setSubmitting(true);
    try {
      const { blob, filename } = await issueService.exportIssues(
        workspaceSlug,
        projectId,
        payload,
        scope === "filtered" ? filteredQueryString : undefined
      );
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
      title="导出工作项"
      open={open}
      onCancel={submitting ? undefined : onClose}
      onOk={handleExport}
      okText="开始导出"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnClose
      width={640}
      maskClosable={!submitting}
    >
      <div className="flex flex-col gap-4">
        <section>
          <div className="mb-2 text-sm font-medium">导出范围</div>
          <Radio.Group value={scope} onChange={(e) => setScope(e.target.value)}>
            <Space direction="vertical">
              <Radio value="selected" disabled={!hasSelection}>
                仅导出已勾选的 {selectedIds.length} 个工作项
                {!hasSelection && <span className="ml-1 text-xs text-secondary">（未勾选）</span>}
              </Radio>
              <Radio value="filtered">导出当前筛选下全部工作项</Radio>
            </Space>
          </Radio.Group>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">导出字段</div>
            <Checkbox
              indeterminate={indeterminate}
              checked={allChecked}
              onChange={(e) => toggleAll(e.target.checked)}
            >
              全选
            </Checkbox>
          </div>
          <div className="max-h-72 overflow-auto rounded border border-subtle p-3">
            <Checkbox.Group
              value={fields}
              onChange={(val) => setFields(val as string[])}
              className="w-full"
            >
              <div className="flex flex-col gap-3">
                {EXPORT_FIELD_GROUPS.map((group) => {
                  const items = itemsByGroup.get(group) || [];
                  if (items.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="mb-1 text-xs text-secondary">{group}</div>
                      <div className="grid grid-cols-3 gap-y-1">
                        {items.map((it) => (
                          <Checkbox key={it.key} value={it.key}>
                            {it.label}
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
          <Radio.Group value={format} onChange={(e) => setFormat(e.target.value)}>
            <Space>
              {EXPORT_FORMAT_OPTIONS.map((opt) => (
                <Radio key={opt.value} value={opt.value}>
                  {opt.label}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        </section>
      </div>
    </Modal>
  );
});

IssueExportModal.displayName = "IssueExportModal";
