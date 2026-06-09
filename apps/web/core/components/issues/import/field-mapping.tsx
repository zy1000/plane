"use client";

/**
 * 字段映射表：左侧展示 Excel 列名，右侧让用户选择对应工作项属性。
 *
 * - 自动从后端 `inspect-import-file` 拉来的 suggested_mapping 预填
 * - 用户可改为「不导入此列」
 * - 必填属性（标题/类型）会高亮提示
 */

import React from "react";
import { Select, Tag } from "antd";
import { EXCLUDED_IMPORT_COLUMNS, IMPORT_FIELD_DEFINITIONS, MULTI_MAP_FIELDS } from "./constants";
import type { FieldMapping, ImportFieldKey } from "./types";
import { IGNORE_FIELD } from "./types";

type Props = {
  headers: string[];
  mapping: FieldMapping;
  onChange: (column: string, value: ImportFieldKey | typeof IGNORE_FIELD) => void;
};

const IGNORE_OPTION = { value: IGNORE_FIELD, label: "不导入此列" };

export function FieldMapping({ headers, mapping, onChange }: Props) {
  const fieldOptions = React.useMemo(
    () => [
      IGNORE_OPTION,
      ...IMPORT_FIELD_DEFINITIONS.map((f) => ({
        value: f.key,
        label: f.required ? `${f.label}（必填）` : f.label,
      })),
    ],
    []
  );

  const visibleHeaders = React.useMemo(
    () => headers.filter((column) => !EXCLUDED_IMPORT_COLUMNS.has(column)),
    [headers]
  );

  // 用于计算各 field_key 的使用次数，避免同一属性被映射到多列。
  const usedCounter = React.useMemo<Record<string, number>>(() => {
    const counter: Record<string, number> = {};
    Object.values(mapping ?? {}).forEach((value) => {
      if (value && value !== IGNORE_FIELD) counter[value] = (counter[value] ?? 0) + 1;
    });
    return counter;
  }, [mapping]);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-secondary">
        请将上传文件中的每个列名匹配到对应工作项属性。必填项：
        <Tag className="ml-1" color="red">
          标题
        </Tag>
        <Tag color="red">类型</Tag>
        <Tag color="red">负责人</Tag>
        其余属性可选。
        <div className="mt-1 text-xs text-placeholder">
          提示：「需求项（表格列）」可映射多列，每列会作为表格的一列写入工作项描述，单元格内可用换行分隔多行。
        </div>
      </div>

      <div className="rounded-md border border-subtle">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 border-b border-subtle bg-surface-2 px-4 py-2 text-sm font-medium text-secondary">
          <div>Excel 列名</div>
          <div>工作项属性</div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {visibleHeaders.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-placeholder">
              请先在上一步选择文件
            </div>
          ) : (
            visibleHeaders.map((column) => {
              const current = (mapping?.[column] ?? IGNORE_FIELD) as ImportFieldKey | typeof IGNORE_FIELD;
              const duplicated =
                current !== IGNORE_FIELD &&
                !MULTI_MAP_FIELDS.has(current as ImportFieldKey) &&
                (usedCounter[current] ?? 0) > 1;
              return (
                <div
                  key={column}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 border-b border-subtle px-4 py-2 last:border-b-0"
                >
                  <div className="truncate text-sm text-primary" title={column}>
                    {column}
                  </div>
                  <Select
                    size="small"
                    value={current}
                    options={fieldOptions}
                    onChange={(value) => onChange(column, value)}
                    status={duplicated ? "error" : undefined}
                    style={{ width: "100%" }}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
