import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ListOrdered, Pencil } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { Tooltip } from "@plane/propel/tooltip";
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

/**
 * 编辑区的外壳：平时没有框，悬停出一圈淡边，聚焦出蓝边 —— 与标题、右栏就地编辑格同一口径。
 * 编辑器正文的 14px 靠 globals.css 里 `.stage-review-drawer-body .editor-container.large-font` 覆盖。
 */
const FIELD_BOX_CLASS =
  "-mx-2.5 rounded-lg border border-transparent px-2.5 py-1.5 transition hover:border-subtle focus-within:border-accent-strong";
const FIELD_LINE_CLASS =
  "min-h-7 [font-family:var(--font-style)] text-[length:var(--font-size-regular)] leading-[var(--line-height-regular)]";

/**
 * 抽屉正文的区块：描述 / 工作指引 / 附件 / 活动共用这一条头 ——
 * 28px 高，14 号加粗名称 + 12 号计数，右侧放动作（28px 图标按钮或页签组）。
 */
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
  <section className="flex flex-col gap-2">
    <div className="flex min-h-7 flex-wrap items-center gap-2">
      <h4 className="text-14 font-semibold text-primary">{title}</h4>
      {count !== undefined && count > 0 && <span className="text-12 text-placeholder tabular-nums">{count}</span>}
      {action && <div className="ml-auto flex items-center gap-1.5">{action}</div>}
    </div>
    {children}
  </section>
);

/** 区块头右侧的图标动作：Plane 标准 IconButton（28px），悬停出名字 */
export const BlockAction = ({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <Tooltip tooltipContent={label}>
    <IconButton variant="ghost" size="lg" icon={icon} aria-label={label} disabled={disabled} onClick={onClick} />
  </Tooltip>
);

/**
 * 就地编辑格的统一外观：平时无边框，悬停浅底，聚焦蓝边。输入框、日期、成员选择三种都照这个来，
 * 左右各伸出 8px 让文字与上下行的值对齐。
 */
export const INLINE_FIELD_CLASS =
  "-mx-2 h-7 w-[calc(100%+1rem)] rounded-md border border-transparent bg-transparent px-2 text-14 hover:bg-layer-2";

const EMPTY_LINE_CLASS = "-mx-2 flex h-8 w-fit max-w-full items-center gap-2 rounded-md px-2 text-14 text-placeholder";

/**
 * 空态一律一行灰字：能改时是可点的「图标 + 添加…」，悬停出浅底；只读时是一行「暂未填写」。
 * 不画空输入框、不画虚线框 —— 空着的评审本来就空，框子只会让它显得又空又乱。
 */
export const EmptyLine = ({
  icon: Icon,
  text,
  disabled,
  onClick,
}: {
  icon?: LucideIcon;
  text: string;
  disabled?: boolean;
  onClick?: () => void;
}) =>
  onClick ? (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(EMPTY_LINE_CLASS, "transition hover:bg-layer-2 hover:text-tertiary disabled:opacity-50")}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{text}</span>
    </button>
  ) : (
    <p className={EMPTY_LINE_CLASS}>{text}</p>
  );

/**
 * 抽屉正文里「要读的那两块」：描述与工作指引。
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
 * 空着时只是一行「添加描述」，点了才挂编辑器；写完仍是空的，失焦后收回那一行。
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
  }, [detail.id, saved]);

  useEffect(() => {
    setIsOpen(false);
  }, [detail.id]);

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
          <EmptyLine text={t(`${I18N}.detail.empty_value`)} />
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

  if (isBlank && !isOpen) {
    return (
      <Block title={title}>
        <EmptyLine icon={Pencil} text={t(`${I18N}.detail.add_description`)} onClick={() => setIsOpen(true)} />
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
          // 什么都没写就收回成一行；写了东西则等保存回灌，不先收起免得闪一下空态
          if (isBlankRichText(draft)) setIsOpen(false);
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

  if (editable && isOpen) {
    return (
      <Block title={title}>
        <div className={FIELD_BOX_CLASS}>
          <textarea
            value={draft}
            autoFocus
            rows={Math.max(1, draft.split(/\r?\n/).length)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (draft !== detail.work_instruction) onUpdate({ work_instruction: draft });
              else setIsOpen(false);
            }}
            placeholder={t(`${I18N}.detail.add_work_instruction`)}
            className={cn(
              "block min-h-7 w-full resize-none bg-transparent p-0 text-14 leading-6 text-primary outline-none",
              "placeholder:text-placeholder placeholder:opacity-100"
            )}
          />
        </div>
      </Block>
    );
  }

  if (isBlank) {
    return (
      <Block title={title}>
        {editable ? (
          <EmptyLine icon={ListOrdered} text={t(`${I18N}.detail.add_work_instruction`)} onClick={() => setIsOpen(true)} />
        ) : (
          <EmptyLine text={t(`${I18N}.detail.empty_value`)} />
        )}
      </Block>
    );
  }

  return (
    <Block
      title={title}
      action={editable && <BlockAction icon={Pencil} label={t(`${I18N}.detail.edit`)} onClick={() => setIsOpen(true)} />}
    >
      <p className="text-14 leading-6 whitespace-pre-wrap text-secondary">{detail.work_instruction}</p>
    </Block>
  );
};
