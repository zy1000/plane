/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { getPageName } from "@plane/utils";

type TPageDownloadFileNameArgs = {
  extension: "md" | "pdf";
  pageTitle?: string;
  suffix?: string;
};

const sanitizeFileNamePart = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const getPageDownloadFileName = ({ extension, pageTitle, suffix }: TPageDownloadFileNameArgs) => {
  const baseName = sanitizeFileNamePart(getPageName(pageTitle ?? "")) || "untitled";
  const safeSuffix = suffix ? sanitizeFileNamePart(suffix) : "";

  return `${[baseName, safeSuffix].filter(Boolean).join("-")}.${extension}`;
};

export const downloadPageBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

export const downloadPageMarkdown = (markdownContent: string, filename: string) => {
  const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
  downloadPageBlob(blob, filename);
};
