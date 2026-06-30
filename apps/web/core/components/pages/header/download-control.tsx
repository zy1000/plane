/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
// plane imports
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
// helpers
import { downloadPageMarkdown, getPageDownloadFileName } from "@/components/pages/helpers/download";
// hooks
import { useParseEditorContent } from "@/hooks/use-parse-editor-content";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

export const PageDownloadControl = observer(function PageDownloadControl({ page }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { workspaceSlug, projectId } = useParams() as { workspaceSlug?: string; projectId?: string };
  const { replaceCustomComponentsFromMarkdownContent } = useParseEditorContent({
    projectId,
    workspaceSlug: workspaceSlug ?? "",
  });
  const {
    name,
    editor: { editorRef },
  } = page;

  const handleDownload = useCallback(() => {
    if (!editorRef) return;

    setIsDownloading(true);
    try {
      const markdownContent = editorRef.getMarkDown();
      const parsedMarkdownContent = replaceCustomComponentsFromMarkdownContent({ markdownContent });
      downloadPageMarkdown(
        parsedMarkdownContent,
        getPageDownloadFileName({
          extension: "md",
          pageTitle: name,
        })
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Page downloaded as Markdown.",
      });
    } catch (error) {
      console.error("Error in downloading page markdown:", error);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Page could not be downloaded. Please try again later.",
      });
    } finally {
      setIsDownloading(false);
    }
  }, [editorRef, name, replaceCustomComponentsFromMarkdownContent]);

  return (
    <Tooltip tooltipContent="Download markdown" position="bottom">
      <IconButton
        variant="ghost"
        size="lg"
        icon={Download}
        onClick={handleDownload}
        loading={isDownloading}
        disabled={!editorRef}
        aria-label="Download markdown"
      />
    </Tooltip>
  );
});
