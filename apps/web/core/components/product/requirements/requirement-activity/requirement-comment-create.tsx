import { useCallback, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import type { TRequirementComment, TRequirementCommentPayload } from "@/services/requirement-comment.service";

type TFormValues = { comment_html: string };

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  productId: string;
  requirementId: string;
  parentId?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  showCancel?: boolean;
  onCancel?: () => void;
  onSubmit: (data: TRequirementCommentPayload) => Promise<TRequirementComment | undefined>;
};

export function RequirementCommentCreate(props: Props) {
  const {
    workspaceSlug,
    workspaceId,
    productId,
    requirementId,
    parentId = null,
    placeholder,
    autoFocus = false,
    disabled = false,
    showCancel = false,
    onCancel,
    onSubmit,
  } = props;
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const editorRef = useRef<EditorRefApi>(null);
  const uploadedAssetIdsRef = useRef<string[]>([]);
  const [commentJson, setCommentJson] = useState<unknown>();
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting },
  } = useForm<TFormValues>({ defaultValues: { comment_html: "<p></p>" } });

  const commentHTML = watch("comment_html");
  const isEmpty = isCommentEmpty(commentHTML ?? undefined);
  const isDisabled = disabled || isSubmitting;

  const submitComment = useCallback(
    async (formData: TFormValues) => {
      if (disabled) return;
      try {
        const created = await onSubmit({
          comment_html: formData.comment_html,
          comment_json: commentJson,
          parent: parentId,
          asset_ids: uploadedAssetIdsRef.current,
        });
        if (!created) return;
        uploadedAssetIdsRef.current = [];
        reset({ comment_html: "<p></p>" });
        editorRef.current?.clearEditor();
        setCommentJson(undefined);
        onCancel?.();
      } catch (error) {
        console.error("[requirement-comment] create failed", error);
      }
    },
    [commentJson, disabled, onCancel, onSubmit, parentId, reset]
  );

  return (
    <div
      className="relative bg-surface-1"
      role="group"
      aria-label={parentId ? "回复评论" : "发表评论"}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !isEmpty &&
          !isDisabled &&
          editorRef.current?.isEditorReadyToDiscard()
        ) {
          handleSubmit(submitComment)(event);
        }
      }}
    >
      <Controller
        name="comment_html"
        control={control}
        render={({ field: { value, onChange } }) => (
          <div className={cn(isDisabled && "cursor-not-allowed opacity-60")}>
            {disabled ? (
              <div className="rounded-sm border border-subtle bg-layer-1 p-2">
                <div className="min-h-16 px-1 py-1 text-body-xs-regular text-placeholder">
                  {placeholder ?? "你没有发表评论的权限"}
                </div>
              </div>
            ) : (
              <LiteTextEditor
                editable
                ref={editorRef}
                id={`requirement_comment_${requirementId}${parentId ? `_${parentId}` : ""}`}
                workspaceId={workspaceId}
                workspaceSlug={workspaceSlug}
                value="<p></p>"
                initialValue={value ?? "<p></p>"}
                placeholder={placeholder}
                showAccessSpecifier={false}
                showSubmitButton
                showToolbarInitially={autoFocus}
                isSubmitting={isSubmitting}
                parentClassName="p-2"
                displayConfig={{ fontSize: "small-font" }}
                submitButtonText="common.comment"
                onEnterKeyPress={(event) => {
                  if (!isEmpty && !isDisabled) handleSubmit(submitComment)(event);
                }}
                onChange={(comment_json, comment_html) => {
                  onChange(comment_html);
                  setCommentJson(comment_json);
                }}
                uploadFile={async (blockId, file) => {
                  const response = await uploadEditorAsset({
                    blockId,
                    workspaceSlug,
                    productId,
                    file,
                    data: {
                      entity_identifier: requirementId,
                      entity_type: EFileAssetType.REQUIREMENT_COMMENT_DESCRIPTION,
                    },
                  });
                  uploadedAssetIdsRef.current = [...uploadedAssetIdsRef.current, response.asset_id];
                  return response.asset_id;
                }}
                duplicateFile={async (assetId) => {
                  const response = await duplicateEditorAsset({
                    assetId,
                    entityId: requirementId,
                    entityType: EFileAssetType.REQUIREMENT_COMMENT_DESCRIPTION,
                    productId,
                    workspaceSlug,
                  });
                  uploadedAssetIdsRef.current = [...uploadedAssetIdsRef.current, response.asset_id];
                  return response.asset_id;
                }}
              />
            )}
          </div>
        )}
      />
      {showCancel && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="rounded px-3 py-1 text-caption-sm-medium text-secondary transition-colors hover:bg-surface-2"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}
