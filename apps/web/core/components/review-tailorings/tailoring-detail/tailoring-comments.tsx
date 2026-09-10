import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { Trash2 } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
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
      <div className="overflow-hidden rounded-lg border border-subtle bg-surface-1">
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
          showSubmitButton={false}
          isSubmitting={isMutating}
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
        <div className="flex justify-end border-t border-subtle px-2 py-1.5">
          <Button variant="primary" size="sm" disabled={isEmpty || isMutating} onClick={handleSubmit}>
            {t("review_tailoring.comments.submit")}
          </Button>
        </div>
      </div>

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
                <div
                  className="prose prose-sm mt-1 max-w-none text-13 text-secondary"
                  // 评论内容由后端 strip 过标签后落库，这里渲染的是编辑器产出的受控 HTML
                  dangerouslySetInnerHTML={{ __html: comment.comment_html }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
