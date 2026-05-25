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

export const XMIND_SUPPORTED_EXTS = ["xmind"] as const;

export const IMAGE_SUPPORTED_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] as const;

const getExt = (filename?: string): string =>
  String(filename ?? "")
    .split(".")
    .pop()
    ?.toLowerCase() ?? "";

export const isOnlyOfficeSupported = (filename?: string): boolean =>
  ONLYOFFICE_SUPPORTED_EXTS.includes(getExt(filename) as (typeof ONLYOFFICE_SUPPORTED_EXTS)[number]);

export const isXmindSupported = (filename?: string): boolean =>
  XMIND_SUPPORTED_EXTS.includes(getExt(filename) as (typeof XMIND_SUPPORTED_EXTS)[number]);

export const isImageSupported = (filename?: string): boolean =>
  IMAGE_SUPPORTED_EXTS.includes(getExt(filename) as (typeof IMAGE_SUPPORTED_EXTS)[number]);
