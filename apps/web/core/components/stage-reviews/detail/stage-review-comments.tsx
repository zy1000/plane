import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { CommentReplyIcon } from "@plane/propel/icons";
import type { TStageReviewComment } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, isCommentEmpty } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { HistoryTime } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useUser } from "@/hooks/store/user";

const I18N = "stage_review";

/**
 * 评论输入框。平时收成一行（头像 + 一行占位），聚焦才展开工具栏与发送按钮。
 *
 * 内联图片走 STAGE_REVIEW_COMMENT_DESCRIPTION：上传时评论还没落库，所以
 * `entity_identifier` 给的是**评审 id**，后端在评论创建后再回填 comment 外键
 * （见 views/asset/v2.py 的那一支）。
 */
export const StageReviewCommentComposer = ({
  reviewId,
  workspaceSlug,
  workspaceId,
  projectId,
  isMutating,
  onCreate,
}: {
  reviewId: string;
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  isMutating: boolean;
  onCreate: (commentHtml: string) => Promise<unknown>;
}) => {
  const { t } = useTranslation();
  const { data: currentUser } = useUser();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const editorRef = useRef<EditorRefApi>(null);
  const [draft, setDraft] = useState("<p></p>");

  const handleSubmit = async () => {
    if (isCommentEmpty(draft) || isMutating) return;
    await onCreate(draft);
    setDraft("<p></p>");
    editorRef.current?.clearEditor();
  };

  return (
    <div className="flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center">
        <Avatar size={26} name={currentUser?.display_name ?? ""} src={getFileURL(currentUser?.avatar_url ?? "")} />
      </span>
      <LiteTextEditor
        editable
        ref={editorRef}
        id={`stage_review_comment_${reviewId}`}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        value="<p></p>"
        initialValue={draft}
        placeholder={t(`${I18N}.detail.comment_placeholder`)}
        showAccessSpecifier={false}
        showToolbarInitially={false}
        // 工具栏内部会再过一遍 t()，这里传的是 key
        submitButtonText={`${I18N}.detail.comment_send`}
        isSubmitting={isMutating}
        onEnterKeyPress={() => void handleSubmit()}
        parentClassName="min-w-0 flex-1 rounded-lg px-3 py-2 focus-within:border-accent-strong"
        displayConfig={{ fontSize: "small-font" }}
        onChange={(_json, html) => setDraft(html)}
        uploadFile={async (blockId, file) => {
          const response = await uploadEditorAsset({
            blockId,
            workspaceSlug,
            projectId,
            file,
            data: { entity_identifier: reviewId, entity_type: EFileAssetType.STAGE_REVIEW_COMMENT_DESCRIPTION },
          });
          return response.asset_id;
        }}
        duplicateFile={async (assetId) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityId: reviewId,
            entityType: EFileAssetType.STAGE_REVIEW_COMMENT_DESCRIPTION,
            projectId,
            workspaceSlug,
          });
          return asset_id;
        }}
      />
    </div>
  );
};

/**
 * 时间线上的一条评论：左边竖线 + 评论图标方块，右边一张卡片 —— 与工作项活动里的评论同一个外壳。
 *
 * 发布后不可编辑，只允许作者本人删（与后端一致）。发言人是这条评审的负责人 / 审核者时
 * 名字后带角色小标签，读讨论时知道谁在拍板。
 */
export const StageReviewCommentCard = ({
  comment,
  leaderId,
  auditorId,
  currentUserId,
  onDelete,
}: {
  comment: TStageReviewComment;
  leaderId: string | null;
  auditorId: string | null;
  currentUserId: string | undefined;
  onDelete: (commentId: string) => void;
}) => {
  const { t } = useTranslation();
  const roleKey =
    comment.actor && comment.actor === leaderId
      ? "role_chip_leader"
      : comment.actor && comment.actor === auditorId
        ? "role_chip_auditor"
        : null;

  return (
    <li className="relative flex gap-3 py-2">
      <span className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
      <span className="relative z-[3] grid size-7 shrink-0 place-items-center rounded-lg border border-subtle bg-layer-2 shadow-raised-100">
        <CommentReplyIcon width={14} height={14} className="text-secondary" aria-hidden="true" />
      </span>
      <div className="group min-w-0 flex-1 rounded-lg border border-subtle bg-layer-2 px-3 py-2.5 shadow-raised-100">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            size="md"
            name={comment.actor_detail?.display_name ?? ""}
            src={getFileURL(comment.actor_detail?.avatar_url ?? "")}
          />
          <span className="truncate text-13 font-semibold text-primary">{comment.actor_detail?.display_name ?? "—"}</span>
          {roleKey && (
            <span className="shrink-0 rounded bg-layer-3 px-1.5 text-12 leading-5 text-tertiary">
              {t(`${I18N}.detail.${roleKey}`)}
            </span>
          )}
          <HistoryTime value={comment.created_at} />
          {comment.actor === currentUserId && (
            <button
              type="button"
              title={t(`${I18N}.actions.delete`)}
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
          className="prose prose-sm mt-1.5 max-w-none text-14 leading-relaxed text-secondary"
          // 评论内容由后端 strip 过标签后落库，这里渲染的是编辑器产出的受控 HTML
          dangerouslySetInnerHTML={{ __html: comment.comment_html }}
        />
      </div>
    </li>
  );
};
