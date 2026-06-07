"use client";

import { useCallback } from "react";
import { observer } from "mobx-react";
import { EFileAssetType } from "@plane/types";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();
const EMPTY_RICH_TEXT_HTML = "<p></p>";

type Props = {
  workspaceSlug: string;
  projectId: string;
  editorId: string;
  initialValue?: string | null;
  editable: boolean;
  dragDropEnabled?: boolean;
  onChange?: (html: string) => void;
  containerClassName?: string;
  placeholder?: string;
};

const MEDIA_CONTENT_REGEX =
  /<(img|image-component|video|iframe|embed|object|svg|audio)\b|data-type=["'](image|imageComponent|video)["']/i;

export const isEmptyCycleRichText = (html?: string | null): boolean => {
  if (!html) return true;
  const trimmed = html.trim();
  if (!trimmed) return true;
  if (MEDIA_CONTENT_REGEX.test(trimmed)) return false;
  const text = trimmed
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return text.length === 0;
};

export const CycleRichTextEditor = observer((props: Props) => {
  const {
    workspaceSlug,
    projectId,
    editorId,
    initialValue,
    editable,
    dragDropEnabled = true,
    onChange,
    containerClassName,
    placeholder,
  } = props;
  const { getWorkspaceBySlug } = useWorkspace();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString();
  const normalizedValue = initialValue?.trim() ? initialValue : EMPTY_RICH_TEXT_HTML;

  const handleUploadFile = useCallback(
    async (blockId: string | undefined, file: File) => {
      const { asset_id } = await uploadEditorAsset({
        blockId: blockId ?? "",
        data: {
          entity_identifier: projectId,
          entity_type: EFileAssetType.PROJECT_DESCRIPTION,
        },
        file,
        projectId,
        workspaceSlug,
      });
      return asset_id;
    },
    [projectId, uploadEditorAsset, workspaceSlug]
  );

  const handleDuplicateFile = useCallback(
    async (assetId: string) => {
      const { asset_id } = await duplicateEditorAsset({
        assetId,
        entityId: projectId,
        entityType: EFileAssetType.PROJECT_DESCRIPTION,
        projectId,
        workspaceSlug,
      });
      return asset_id;
    },
    [duplicateEditorAsset, projectId, workspaceSlug]
  );

  if (!workspaceId) return null;

  if (!editable) {
    return (
      <RichTextEditor
        id={editorId}
        editable={false}
        initialValue={normalizedValue}
        value={normalizedValue}
        onChange={() => {}}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        containerClassName={containerClassName}
      />
    );
  }

  return (
    <RichTextEditor
      id={editorId}
      editable
      initialValue={normalizedValue}
      value={null}
      onChange={(_descriptionJson, descriptionHtml) => onChange?.(descriptionHtml)}
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      projectId={projectId}
      dragDropEnabled={dragDropEnabled}
      placeholder={placeholder}
      searchMentionCallback={async (payload) =>
        await workspaceService.searchEntity(workspaceSlug, {
          ...payload,
          project_id: projectId,
        })
      }
      uploadFile={handleUploadFile}
      duplicateFile={handleDuplicateFile}
      containerClassName={containerClassName}
    />
  );
});
