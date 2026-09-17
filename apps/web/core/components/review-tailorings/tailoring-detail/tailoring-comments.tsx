import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { Trash2 } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { TReviewTailoringComment } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, isCommentEmpty, renderFormattedDateTime } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useUser } from "@/hooks/store/user";

/**
 * 裁剪表的评论。发布后不可编辑，只允许作者本人删 —— 与后端一致。
 *
 * 内联图片走 PROJECT_DESCRIPTION 资产：给评论单开一个 entity_type 要连带改 FileAsset
 * 外键、file_path 解析和资产目录树三处，评论图片撑不起这个成本。
 */
export const TailoringComments = observer(function TailoringComments({
  comments,
  workspaceSlug,
  workspaceId,
  projectId,
  isMutating,
  onCreate,
  onDelete,
}: {
  comments: TReviewTailoringComment[];
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  isMutating: boolean;
  onCreate: (commentHtml: string) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const editorRef = useRef<EditorRefApi>(null);
  const [draft, setDraft] = useState("<p></p>");

  const isEmpty = isCommentEmpty(draft);

  const handleSubmit = async () => {
    if (isEmpty || isMutating) return;
    await onCreate(draft);
    setDraft("<p></p>");
    editorRef.current?.clearEditor();
  };

  return (
    <div className="space-y-4">
      {/* 与工作项评论一致：平时一行输入框，聚焦才展开工具栏，发送按钮在工具栏右侧；回车发送 */}
      <LiteTextEditor
        editable
        ref={editorRef}
        id={`review_tailoring_comment_${projectId}`}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        value="<p></p>"
        initialValue={draft}
        placeholder={t("review_tailoring.comments.placeholder")}
        showAccessSpecifier={false}
        showToolbarInitially={false}
        // 工具栏内部会再过一遍 t()，这里传的是 key
        submitButtonText="review_tailoring.comments.submit"
        isSubmitting={isMutating}
        onEnterKeyPress={() => void handleSubmit()}
        parentClassName="p-2"
        displayConfig={{ fontSize: "small-font" }}
        onChange={(_json, html) => setDraft(html)}
        uploadFile={async (blockId, file) => {
          const response = await uploadEditorAsset({
            blockId,
            workspaceSlug,
            projectId,
            file,
            data: { entity_identifier: projectId, entity_type: EFileAssetType.PROJECT_DESCRIPTION },
          });
          return response.asset_id;
        }}
        duplicateFile={async (assetId) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityId: projectId,
            entityType: EFileAssetType.PROJECT_DESCRIPTION,
            projectId,
            workspaceSlug,
          });
          return asset_id;
        }}
      />

      {comments.length === 0 ? (
        <p className="py-4 text-center text-12 text-tertiary">{t("review_tailoring.comments.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="group flex gap-2.5">
              <Avatar
                size="base"
                name={comment.actor_detail?.display_name ?? ""}
                src={getFileURL(comment.actor_detail?.avatar_url ?? "")}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-12 font-medium text-primary">
                    {comment.actor_detail?.display_name ?? "—"}
                  </span>
                  <span className="text-11 text-tertiary">{renderFormattedDateTime(comment.created_at)}</span>
                  {comment.actor === currentUser?.id && (
                    <button
                      type="button"
                      title={t("review_tailoring.comments.delete")}
                      className={cn(
                        "ml-auto rounded p-1 text-tertiary opacity-0 transition",
                        "hover:bg-danger-subtle hover:text-danger-primary group-hover:opacity-100"
                      )}
                      onClick={() => onDelete(comment.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                {/* 正文里的图片只存了 asset id（<image-component src="id">），直接塞 HTML 显示不出来，
                    要走只读编辑器把 id 换成地址 —— 与工作项评论一致 */}
                <LiteTextEditor
                  editable={false}
                  id={`review_tailoring_comment_view_${comment.id}`}
                  initialValue={comment.comment_html ?? ""}
                  workspaceId={workspaceId}
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  containerClassName="!p-0 mt-1"
                  parentClassName="border-none"
                  displayConfig={{ fontSize: "small-font" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
