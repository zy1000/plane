import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewDetail, TUpdateStageReviewPayload } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { cn } from "@plane/utils";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();
const EMPTY_RICH_TEXT = "<p></p>";
const I18N = "stage_review";

/** 富文本是不是「等于没写」：编辑器清空后留下的是 `<p></p>` 而不是空串 */
const isBlankRichText = (html: string | null | undefined) => {
  const text = (html ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
  return text.length === 0 && !/<(img|image-component|video|table)\b/i.test(html ?? "");
};

export const Block = ({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-2.5">
    <h4 className="flex items-center gap-2 text-12 font-semibold tracking-wide text-tertiary">
      {title}
      {count !== undefined && <span className="font-medium text-placeholder tabular-nums">{count}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </h4>
    {children}
  </section>
);

/** 空字段的一行占位：点一下才展开编辑器，不占一个大空框 */
const GhostRow = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 rounded-lg border border-dashed border-subtle bg-layer-1 px-3 py-2",
      "text-13 text-tertiary transition hover:border-strong hover:text-secondary"
    )}
  >
    <Pencil className="size-3.5" />
    {label}
  </button>
);

/**
 * 抽屉正文里「要读的那两块」：描述与工作指引。
 *
 * 空着的时候各占一行虚线占位，点一下才展开编辑器 —— 裁剪生成的评审这两块多半是空的
 * （模板没写描述，工作指引本来就只在实例上），摆两个大空框会让人以为系统没有这些字段。
 *
 * 描述用**工作项那套富文本**（RichTextEditor：工具栏、斜杠命令、@提及、拖拽上传）；
 * 工作指引是纯文本，模型上就是 TextField，没有 HTML 列可存。
 */
export const StageReviewContent = ({
  workspaceSlug,
  workspaceId,
  projectId,
  detail,
  editable,
  onUpdate,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  detail: TStageReviewDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Block title={t(`${I18N}.fields.description`)}>
        <DescriptionEditor
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          projectId={projectId}
          detail={detail}
          editable={editable}
          onUpdate={onUpdate}
        />
      </Block>

      <Block title={t(`${I18N}.fields.work_instruction`)}>
        <WorkInstruction detail={detail} editable={editable} onUpdate={onUpdate} />
      </Block>
    </>
  );
};

/**
 * 描述。内联图片走 PROJECT_DESCRIPTION 资产，与迭代描述（CycleRichTextEditor）同一个
 * 取舍：单开一个 entity_type 要连带改 FileAsset 外键、file_path 解析和资产目录树三处。
 *
 * 存在**焦点离开整块**时：contenteditable 的 focusout 会冒泡到外层 div，点工具栏按钮
 * 也算 focusout，所以要用 relatedTarget 判断焦点是不是还留在块内。
 */
const DescriptionEditor = ({
  workspaceSlug,
  workspaceId,
  projectId,
  detail,
  editable,
  onUpdate,
}: {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  detail: TStageReviewDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
}) => {
  const { t } = useTranslation();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const isBlank = isBlankRichText(detail.description_html);
  const saved = isBlank ? EMPTY_RICH_TEXT : (detail.description_html as string);
  const [draft, setDraft] = useState(saved);
  const [isOpen, setIsOpen] = useState(false);

  // 换一条评审、或存完之后回灌
  useEffect(() => {
    setDraft(saved);
    setIsOpen(false);
  }, [detail.id, saved]);

  const handleUploadFile = useCallback(
    async (blockId: string | undefined, file: File) => {
      const { asset_id } = await uploadEditorAsset({
        blockId: blockId ?? "",
        data: { entity_identifier: projectId, entity_type: EFileAssetType.PROJECT_DESCRIPTION },
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

  if (!editable) {
    return isBlank ? (
      <p className="text-13 text-tertiary">{t(`${I18N}.detail.empty_value`)}</p>
    ) : (
      <RichTextEditor
        id={`stage_review_description_${detail.id}`}
        editable={false}
        initialValue={saved}
        value={saved}
        onChange={() => {}}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        containerClassName="!p-0 text-13 leading-relaxed text-secondary"
      />
    );
  }

  if (isBlank && !isOpen) {
    return <GhostRow label={t(`${I18N}.detail.add_description`)} onClick={() => setIsOpen(true)} />;
  }

  return (
    <div
      className="rounded-lg border border-subtle bg-surface-1 px-3 py-2"
      onBlur={(event) => {
        // 焦点还在块内（比如点了工具栏按钮）就不算改完
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        if (draft !== saved) onUpdate({ description_html: draft });
      }}
    >
      <RichTextEditor
        // 换评审要重挂：editable 时 value 传 null，内容只在挂载时由 initialValue 灌一次
        key={detail.id}
        id={`stage_review_description_${detail.id}`}
        editable
        autofocus={isOpen}
        initialValue={saved}
        value={null}
        onChange={(_json, html) => setDraft(html)}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        placeholder={t(`${I18N}.detail.description_placeholder`)}
        searchMentionCallback={async (payload) =>
          await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: projectId })
        }
        uploadFile={handleUploadFile}
        duplicateFile={handleDuplicateFile}
        containerClassName="!p-0 text-13 leading-relaxed"
      />
    </div>
  );
};

/** 工作指引是纯文本（模型上就是 TextField），不套编辑器 */
const WorkInstruction = ({
  detail,
  editable,
  onUpdate,
}: {
  detail: TStageReviewDetail;
  editable: boolean;
  onUpdate: (payload: TUpdateStageReviewPayload) => void;
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(detail.work_instruction);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setDraft(detail.work_instruction);
    setIsOpen(false);
  }, [detail.id, detail.work_instruction]);

  if (!editable) {
    return (
      <p
        className={cn(
          "text-13 leading-relaxed whitespace-pre-line",
          detail.work_instruction ? "text-secondary" : "text-tertiary"
        )}
      >
        {detail.work_instruction || t(`${I18N}.detail.empty_value`)}
      </p>
    );
  }

  if (!detail.work_instruction && !isOpen) {
    return <GhostRow label={t(`${I18N}.detail.add_work_instruction`)} onClick={() => setIsOpen(true)} />;
  }

  return (
    <textarea
      value={draft}
      autoFocus={isOpen}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== detail.work_instruction) onUpdate({ work_instruction: draft });
      }}
      placeholder={t(`${I18N}.detail.work_instruction_placeholder`)}
      className={cn(
        "min-h-20 w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-13 leading-relaxed",
        "text-primary placeholder:text-tertiary focus:border-accent-strong focus:outline-none"
      )}
    />
  );
};
