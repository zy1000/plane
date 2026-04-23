/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** 触发一次浏览器下载：把 blob 以指定文件名保存到本地。 */
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 将 applied filters 对象编码成 URLSearchParams 字符串。
 * 对 list/字符串数组类型的值（如 priority: ["high","urgent"]）使用逗号连接，与后端 issue_filters 约定一致。
 */
export const stringifyAppliedFilters = (
  filters: Record<string, unknown> | undefined | null
): string => {
  if (!filters) return "";
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      params.set(key, value.filter((v) => v !== undefined && v !== null && v !== "").join(","));
    } else if (typeof value === "boolean") {
      params.set(key, value ? "true" : "false");
    } else {
      params.set(key, String(value));
    }
  });
  return params.toString();
};
