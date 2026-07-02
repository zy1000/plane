/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState, type MouseEvent } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
// plane imports
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { convertHTMLToMarkdown } from "@plane/utils";
// helpers
import { downloadPageMarkdown, getPageDownloadFileName } from "@/components/pages/helpers/download";
// hooks
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageStore } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageListDownloadControl = observer(function PageListDownloadControl({ page, storeType }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug?: string; projectId?: string };
  const { fetchPageDetails } = usePageStore(storeType);
  const { getEditorMetaData, replaceCustomComponentsFromMarkdownContent } = useParseEditorContent({
    projectId,
    workspaceSlug: workspaceSlug ?? "",
  });
  const { id: pageId, name } = page;
  const isDisabled = isDownloading || !workspaceSlug || !projectId || !pageId;

  const handleDownload = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!workspaceSlug || !projectId || !pageId) return;

      setIsDownloading(true);
      try {
        const pageDetails = await fetchPageDetails(workspaceSlug, projectId, pageId, { trackVisit: false });
        const pageContent = pageDetails?.description_html ?? page.description_html ?? "<p></p>";
        const markdownContent = convertHTMLToMarkdown({
          description_html: pageContent,
          metaData: getEditorMetaData(pageContent),
        });
        const parsedMarkdownContent = replaceCustomComponentsFromMarkdownContent({ markdownContent });

        downloadPageMarkdown(
          parsedMarkdownContent,
          getPageDownloadFileName({
            extension: "md",
            pageTitle: pageDetails?.name ?? name,
          })
        );
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "成功！",
          message: "笔记已下载为 Markdown。",
        });
      } catch (error) {
        console.error("Error in downloading page markdown:", error);
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "错误！",
          message: "笔记下载失败，请稍后重试。",
        });
      } finally {
        setIsDownloading(false);
      }
    },
    [
      fetchPageDetails,
      getEditorMetaData,
      name,
      page.description_html,
      pageId,
      projectId,
      replaceCustomComponentsFromMarkdownContent,
      workspaceSlug,
    ]
  );

  return (
    <Tooltip tooltipContent="下载 Markdown">
      <IconButton
        variant="ghost"
        size="base"
        icon={Download}
        onClick={handleDownload}
        loading={isDownloading}
        disabled={isDisabled}
        aria-label="下载 Markdown"
      />
    </Tooltip>
  );
});
