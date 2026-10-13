import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { TRiskComment } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL, isCommentEmpty } from "@plane/utils";
import { LiteTextEditor } from "@/components/editor/lite-text";
import { HistoryTime } from "@/components/requirements/requirement-detail/requirement-history-timeline";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { FileService } from "@/services/file.service";
import { useUser } from "@/hooks/store/user";
import { RISK_I18N } from "../constants";
import { RiskTimelineRow } from "./risk-timeline";

/**
 * 评论输入框。平时收成一行（头像 + 一行占位），聚焦才展开工具栏与发送按钮。
 *
 * 内联图片走 RISK_COMMENT_DESCRIPTION：上传时评论还没落库，所以 `entity_identifier` 给的是
 * **风险 id**，后端在评论创建后再回填 comment 外键（口径同阶段评审评论）。
 */
const fileService = new FileService();

export const RiskCommentComposer = ({
  riskId,
  workspaceSlug,
  workspaceId,
  projectId,
  isMutating,
  onCreate,
}: {
  riskId: string;
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
  /** 这条评论里上传过的图片：上传时评论还没落库，发出去后再按评论 id 回填 `risk_comment_id` */
  const uploadedAssetIdsRef = useRef<string[]>([]);

  const handleSubmit = async () => {
    if (isCommentEmpty(draft) || isMutating) return;
    // 发送失败时（抽屉会弹错误提示）保留草稿，不清空输入框
    const created = (await onCreate(draft)) as { id?: string } | undefined;
    if (!created) return;
    const assetIds = uploadedAssetIdsRef.current;
    if (created.id && assetIds.length > 0) {
      // 绑定失败不影响评论本身，只是删评论时图片不会跟着级联，口径同发布单评论
      try {
        await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId, created.id, {
          asset_ids: assetIds,
        });
      } catch (error) {
        console.error("[risk-comment] bind assets failed", error);
      }
    }
    uploadedAssetIdsRef.current = [];
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
        id={`risk_comment_${riskId}`}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        value="<p></p>"
        initialValue={draft}
        placeholder={t(`${RISK_I18N}.detail.comment_placeholder`)}
        showAccessSpecifier={false}
        showToolbarInitially={false}
        // 工具栏内部会再过一遍 t()，这里传的是 key
        submitButtonText={`${RISK_I18N}.detail.comment_send`}
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
            data: { entity_identifier: riskId, entity_type: EFileAssetType.RISK_COMMENT_DESCRIPTION },
          });
          uploadedAssetIdsRef.current.push(response.asset_id);
          return response.asset_id;
        }}
        duplicateFile={async (assetId) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityId: riskId,
            entityType: EFileAssetType.RISK_COMMENT_DESCRIPTION,
            projectId,
            workspaceSlug,
          });
          uploadedAssetIdsRef.current.push(asset_id);
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
 * 发布后不可编辑，只允许作者本人删（与后端一致）。
 */
export const RiskCommentCard = ({
  comment,
  isFirst,
  isLast,
  workspaceSlug,
  workspaceId,
  projectId,
  currentUserId,
  onDelete,
}: {
  comment: TRiskComment;
  isFirst: boolean;
  isLast: boolean;
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  currentUserId: string | undefined;
  onDelete: (commentId: string) => void;
}) => {
  const { t } = useTranslation();

  return (
    <RiskTimelineRow
      isFirst={isFirst}
      isLast={isLast}
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
          <span className="truncate text-14 font-medium text-primary">
            {comment.actor_detail?.display_name ?? t(`${RISK_I18N}.activity.unknown_user`)}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {currentUserId && comment.actor === currentUserId && (
              <button
                type="button"
                title={t(`${RISK_I18N}.detail.delete_comment`)}
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
        {/* 正文里的图片只存了 asset id（<image-component src="id">），直接塞 HTML 显示不出来，
            要走只读编辑器把 id 换成地址 —— 与工作项评论一致 */}
        <LiteTextEditor
          editable={false}
          id={`risk_comment_view_${comment.id}`}
          initialValue={comment.comment_html ?? ""}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          containerClassName="!p-0 mt-1"
          parentClassName="border-none"
          displayConfig={{ fontSize: "small-font" }}
        />
      </div>
    </RiskTimelineRow>
  );
};
