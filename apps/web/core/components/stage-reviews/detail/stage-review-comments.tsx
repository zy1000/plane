import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewComment } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, isCommentEmpty } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { HistoryTime } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useUser } from "@/hooks/store/user";
import type { TTimelineRowPosition } from "./stage-review-timeline-rail";
import { TimelineRow } from "./stage-review-timeline-rail";

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
    // 发送失败时（抽屉会弹错误提示）保留草稿，不清空输入框
    const created = await onCreate(draft);
    if (!created) return;
    setDraft("<p></p>");
    editorRef.current?.clearEditor();
  };

  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3">
      <span className="grid size-7 place-items-center pt-1">
        <Avatar size={28} name={currentUser?.display_name ?? ""} src={getFileURL(currentUser?.avatar_url ?? "")} />
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
        parentClassName="min-w-0 rounded-lg border border-subtle px-3 py-2 focus-within:border-accent-strong"
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

/** 行上下各 10px，头像 28px：圆心离行顶 24px */
const COMMENT_NODE_CENTER = 24;

/**
 * 时间线上的一条评论：发言人头像直接坐在轨道上，右边一个气泡。
 *
 * 发布后不可编辑，只允许作者本人删（与后端一致）。发言人是这条评审的负责人 / 审核者时
 * 名字后带角色小标签，读讨论时知道谁在拍板。
 */
export const StageReviewCommentCard = ({
  comment,
  position,
  leaderId,
  auditorId,
  currentUserId,
  onDelete,
}: {
  comment: TStageReviewComment;
  position: TTimelineRowPosition;
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
    <TimelineRow
      item={position.rail}
      isFirst={position.isFirst}
      isLast={position.isLast}
      nodeCenter={COMMENT_NODE_CENTER}
      className="py-2.5"
      node={
        <span className="grid place-items-center rounded-full shadow-[0_0_0_3px_var(--bg-surface-1)]">
          <Avatar
            size={28}
            name={comment.actor_detail?.display_name ?? ""}
            src={getFileURL(comment.actor_detail?.avatar_url ?? "")}
          />
        </span>
      }
    >
      <div className="group min-w-0 rounded-lg border border-subtle bg-surface-1 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-14 font-medium text-primary">{comment.actor_detail?.display_name ?? "—"}</span>
          {roleKey && (
            <span className="shrink-0 rounded-md bg-layer-2 px-1.5 text-12 leading-5 text-tertiary">
              {t(`${I18N}.detail.${roleKey}`)}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {comment.actor === currentUserId && (
              <button
                type="button"
                title={t(`${I18N}.actions.delete`)}
                className={cn(
                  "rounded-md p-1 text-tertiary opacity-0 transition focus-visible:opacity-100",
                  "hover:bg-danger-subtle hover:text-danger-primary group-hover:opacity-100"
                )}
                onClick={() => onDelete(comment.id)}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <HistoryTime value={comment.created_at} />
          </span>
        </div>
        <div
          className="prose prose-sm mt-1 max-w-none text-14 leading-relaxed text-secondary"
          // 评论内容由后端 strip 过标签后落库，这里渲染的是编辑器产出的受控 HTML
          dangerouslySetInnerHTML={{ __html: comment.comment_html }}
        />
      </div>
    </TimelineRow>
  );
};
