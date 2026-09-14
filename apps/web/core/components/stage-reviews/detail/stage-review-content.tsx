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

/** 区块标题右侧的小动作：描边小按钮（上传附件）或安静的文字（编辑） */
export const BLOCK_ACTION_CLASS = cn(
  "inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-12 font-medium transition disabled:opacity-50",
  "border border-strong bg-surface-1 text-secondary hover:bg-layer-2"
);
export const BLOCK_ACTION_QUIET_CLASS =
  "inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-12 font-medium text-placeholder transition hover:bg-layer-2 hover:text-secondary";

const FIELD_BOX_CLASS =
  "-mx-2.5 rounded-lg border border-subtle px-2.5 py-1.5 transition focus-within:bg-surface-1";
/** 跟描述 RichTextEditor 同一套字：large-font = 1rem / 1.5rem，Inter */
const FIELD_EDITOR_CLASS = "editor-container large-font sans-serif line-spacing-regular";
const FIELD_LINE_CLASS =
  "min-h-7 [font-family:var(--font-style)] text-[length:var(--font-size-regular)] leading-[var(--line-height-regular)]";

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
    <h4 className="flex min-h-6.5 items-center gap-2 text-14 font-semibold text-primary">
      {title}
      {count !== undefined && count > 0 && (
        <span className="text-12 font-medium text-placeholder tabular-nums">{count}</span>
      )}
      {action && <span className="ml-auto flex items-center">{action}</span>}
    </h4>
    {children}
  </section>
);

/**
 * 抽屉正文里「要读的那两块」：描述与工作指引。
 *
 * 描述用**工作项那套富文本**（RichTextEditor：工具栏、斜杠命令、@提及、拖拽上传），空着也画框；
 * 工作指引是纯文本，模型上就是 TextField，没有 HTML 列可存，读的时候按行渲成编号清单。
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
}) => (
  <>
    <DescriptionEditor
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      projectId={projectId}
      detail={detail}
      editable={editable}
      onUpdate={onUpdate}
    />
    <WorkInstruction detail={detail} editable={editable} onUpdate={onUpdate} />
  </>
);

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

  // 换一条评审、或存完之后回灌
  useEffect(() => {
    setDraft(saved);
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

  const title = t(`${I18N}.fields.description`);

  if (!editable) {
    return (
      <Block title={title}>
        {isBlank ? (
          <p className="text-14 text-placeholder">{t(`${I18N}.detail.empty_value`)}</p>
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
            containerClassName={`!p-0 ${FIELD_LINE_CLASS} text-secondary`}
          />
        )}
      </Block>
    );
  }

  return (
    <Block title={title}>
      <div
        className={FIELD_BOX_CLASS}
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
          initialValue={saved}
          value={null}
          onChange={(_json, html) => setDraft(html)}
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          projectId={projectId}
          placeholder={t("common.click_to_add_description")}
          searchMentionCallback={async (payload) =>
            await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: projectId })
          }
          uploadFile={handleUploadFile}
          duplicateFile={handleDuplicateFile}
          containerClassName={`!p-0 ${FIELD_LINE_CLASS}`}
        />
      </div>
    </Block>
  );
};

/**
 * 工作指引是纯文本（模型上就是 TextField），不套编辑器。按用户写下的样子展示，不加编号。
 */
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

  const title = t(`${I18N}.fields.work_instruction`);
  const isBlank = !detail.work_instruction.trim();

  if (editable && (isOpen || isBlank)) {
    return (
      <Block title={title}>
        <div className={cn(FIELD_BOX_CLASS, FIELD_EDITOR_CLASS)}>
          <textarea
            value={draft}
            autoFocus={isOpen}
            rows={Math.max(1, draft.split(/\r?\n/).length)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (draft !== detail.work_instruction) onUpdate({ work_instruction: draft });
              else setIsOpen(false);
            }}
            placeholder={t(`${I18N}.detail.add_work_instruction`)}
            className={cn(
              "block w-full resize-none bg-transparent p-0 pb-1 text-primary outline-none",
              "placeholder:text-placeholder placeholder:opacity-100",
              FIELD_LINE_CLASS
            )}
          />
        </div>
      </Block>
    );
  }

  if (isBlank) {
    return (
      <Block title={title}>
        <p className="text-14 text-placeholder">{t(`${I18N}.detail.empty_value`)}</p>
      </Block>
    );
  }

  return (
    <Block
      title={title}
      action={
        editable && (
          <button type="button" className={BLOCK_ACTION_QUIET_CLASS} onClick={() => setIsOpen(true)}>
            <Pencil className="size-3" />
            {t(`${I18N}.detail.edit`)}
          </button>
        )
      }
    >
      <p className="whitespace-pre-wrap text-14 leading-relaxed text-secondary">{detail.work_instruction}</p>
    </Block>
  );
};
