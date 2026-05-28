/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useForm, Controller } from "react-hook-form";
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import type { TReleaseComment } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { FileService } from "@/services/file.service";

type FormValues = {
  comment_html: string;
};

type SubmitPayload = {
  comment_html: string;
  comment_json?: unknown;
  parent: string | null;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  releaseId: string;
  parentId?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit: (data: SubmitPayload) => Promise<TReleaseComment | undefined>;
  onCancel?: () => void;
  showCancel?: boolean;
};

const fileService = new FileService();

export const ReleaseCommentCreate = observer(function ReleaseCommentCreate(props: Props) {
  const {
    workspaceSlug,
    workspaceId,
    projectId,
    releaseId,
    parentId = null,
    placeholder,
    autoFocus = false,
    onSubmit,
    onCancel,
    showCancel = false,
  } = props;
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const editorRef = useRef<EditorRefApi>(null);
  const [commentJson, setCommentJson] = useState<unknown>(null);
  // 跟踪本次编辑期间已经上传到 S3 的 asset_id，提交成功后回填到 release_comment_id，
  // 让 FileAsset 与具体评论建立绑定（评论被删除时随之级联清理）。
  const uploadedAssetIdsRef = useRef<string[]>([]);

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting },
    reset,
  } = useForm<FormValues>({
    defaultValues: { comment_html: "<p></p>" },
  });

  const commentHTML = watch("comment_html");
  const isEmpty = isCommentEmpty(commentHTML ?? undefined);

  const submitComment = useCallback(
    async (formData: FormValues) => {
      try {
        const created = await onSubmit({
          comment_html: formData.comment_html,
          comment_json: commentJson ?? undefined,
          parent: parentId,
        });
        const assetIds = uploadedAssetIdsRef.current;
        if (created?.id && assetIds.length > 0) {
          try {
            await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId, created.id, {
              asset_ids: assetIds,
            });
          } catch (error) {
            console.error("[release-comment] bind assets failed", error);
          }
        }
        uploadedAssetIdsRef.current = [];
        reset({ comment_html: "<p></p>" });
        editorRef.current?.clearEditor();
        setCommentJson(null);
        onCancel?.();
      } catch (error) {
        console.error("[release-comment] create failed", error);
      }
    },
    [onSubmit, commentJson, parentId, workspaceSlug, projectId, reset, onCancel]
  );

  return (
    <div
      className={cn("relative bg-surface-1")}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !isEmpty &&
          !isSubmitting &&
          editorRef.current?.isEditorReadyToDiscard()
        ) {
          handleSubmit(submitComment)(e);
        }
      }}
    >
      <Controller
        name="comment_html"
        control={control}
        render={({ field: { value, onChange } }) => (
          <LiteTextEditor
            editable
            ref={editorRef}
            id={`release_comment_create_${releaseId}${parentId ? `_${parentId}` : ""}`}
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            value={"<p></p>"}
            initialValue={value ?? "<p></p>"}
            placeholder={placeholder}
            showAccessSpecifier={false}
            showSubmitButton
            showToolbarInitially={autoFocus}
            isSubmitting={isSubmitting}
            parentClassName="p-2"
            displayConfig={{ fontSize: "small-font" }}
            submitButtonText="common.comment"
            onEnterKeyPress={(e) => {
              if (!isEmpty && !isSubmitting) handleSubmit(submitComment)(e);
            }}
            onChange={(comment_json, comment_html) => {
              onChange(comment_html);
              setCommentJson(comment_json);
            }}
            uploadFile={async (blockId, file) => {
              const response = await uploadEditorAsset({
                blockId,
                workspaceSlug,
                projectId,
                file,
                data: {
                  entity_identifier: releaseId,
                  entity_type: EFileAssetType.RELEASE_COMMENT_DESCRIPTION,
                },
              });
              uploadedAssetIdsRef.current = [...uploadedAssetIdsRef.current, response.asset_id];
              return response.asset_id;
            }}
            duplicateFile={async (assetId) => {
              const { asset_id } = await duplicateEditorAsset({
                assetId,
                entityId: releaseId,
                entityType: EFileAssetType.RELEASE_COMMENT_DESCRIPTION,
                projectId,
                workspaceSlug,
              });
              uploadedAssetIdsRef.current = [...uploadedAssetIdsRef.current, asset_id];
              return asset_id;
            }}
          />
        )}
      />
      {showCancel && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="rounded px-3 py-1 text-xs text-secondary transition-colors hover:bg-surface-2"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
});
