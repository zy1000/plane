/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const ONLYOFFICE_SUPPORTED_EXTS = [
  "doc",
  "docx",
  "odt",
  "rtf",
  "txt",
  "xls",
  "xlsx",
  "ods",
  "csv",
  "ppt",
  "pptx",
  "odp",
  "pdf",
] as const;

export const isOnlyOfficeSupported = (filename?: string): boolean => {
  const ext = String(filename ?? "")
    .split(".")
    .pop()
    ?.toLowerCase() ?? "";
  return ONLYOFFICE_SUPPORTED_EXTS.includes(ext as (typeof ONLYOFFICE_SUPPORTED_EXTS)[number]);
};
