/**
 * 需求富文本的三种形态：只读渲染、内联编辑器、网格单元格（摘要 + 弹窗编辑）。
 *
 * 自定义 rich_text 字段与内置「描述」列共用这一份，两处的富文本长得不一样是这类
 * 表单最容易积累的不一致。后端对两者都走同一套 HTML 消毒（validate_html_content），
 * 前端也就不该分家。
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { EFileAssetType } from "@plane/types";
import { cn, stripAndTruncateHTML } from "@plane/utils";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";
import { DraftInput } from "./draft-input";
import {
  EXPANDABLE_CELL_INPUT_CLASS,
  ExpandableCell,
  ExpandableCellModal,
  type TExpandableCellVariant,
} from "./expandable-cell";

const workspaceService = new WorkspaceService();
const EMPTY_RICH_TEXT_HTML = "<p></p>";
/** 单元格摘要的截断长度，与 LeafValue 里其它文本字段保持一致 */
const CELL_PREVIEW_LENGTH = 180;

const normalizeRichText = (value: string | null | undefined) => (value?.trim() ? value : EMPTY_RICH_TEXT_HTML);

/**
 * 空值有两种写法：库里存的 "" 与编辑器吐出来的 "<p></p>"。不把它们判等的话，
 * 光是点进一个空的富文本框再点走，就会白写一次值、白涨一次 version。
 */
const hasRichTextChanged = (next: string, current: string | null | undefined) =>
  normalizeRichText(next) !== normalizeRichText(current);

/**
 * 「简单内容」= 空，或只有一段、段内没有任何标签的 HTML。编辑器吐出的 <p> 带 class，
 * 后端 nh3 也留着它，所以起始标签要允许属性。
 */
const SIMPLE_PARAGRAPH_RE = /^\s*(?:<p(?:\s[^>]*)?>([^<]*)<\/p>)?\s*$/;
const NAMED_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

const decodeEntities = (text: string) =>
  text
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (match, name) => NAMED_ENTITIES[name] ?? match);

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 单段纯文本的 HTML → 单元格输入框里的文本；带格式、图片或多段的返回 null，交给弹窗。
 * 不 trim：text → html → text 必须恒等，否则受控输入框每敲一下都会被回流值改写，光标跟着跳。
 */
const toInlineText = (html: string | null | undefined) => {
  const match = SIMPLE_PARAGRAPH_RE.exec(html ?? "");
  return match ? decodeEntities(match[1] ?? "") : null;
};

/** 输入框里的文本 → 存库的单段 HTML。空串就是空串，hasRichTextChanged 把它和 <p></p> 判等 */
const fromInlineText = (text: string) => (text ? `<p>${escapeHtml(text)}</p>` : "");

/**
 * workspaceId 解析 + 编辑器的上传/复制回调。
 *
 * 需求的资源挂在工作区下而非项目下（所以不传 projectId），实体类型沿用附件字段
 * 已在用的 REQUIREMENT_ATTACHMENT —— 不为了内联图片再开一个新的 asset 类型。
 */
const useRequirementEditorAssets = ({
  workspaceSlug,
  entityId,
  onAssetUpload,
}: {
  workspaceSlug: string;
  entityId: string;
  onAssetUpload?: (assetId: string) => void;
}) => {
  const { getWorkspaceBySlug } = useWorkspace();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString();

  const handleUpload = useCallback(
    async (blockId: string, file: File) => {
      const { asset_id } = await uploadEditorAsset({
        blockId,
        data: { entity_identifier: entityId, entity_type: EFileAssetType.REQUIREMENT_ATTACHMENT },
        file,
        workspaceSlug,
      });
      onAssetUpload?.(asset_id);
      return asset_id;
    },
    [entityId, onAssetUpload, uploadEditorAsset, workspaceSlug]
  );

  const handleDuplicate = useCallback(
    async (assetId: string) => {
      const { asset_id } = await duplicateEditorAsset({
        assetId,
        entityId,
        entityType: EFileAssetType.REQUIREMENT_ATTACHMENT,
        workspaceSlug,
      });
      onAssetUpload?.(asset_id);
      return asset_id;
    },
    [duplicateEditorAsset, entityId, onAssetUpload, workspaceSlug]
  );

  return { workspaceId, handleUpload, handleDuplicate };
};

type TFieldProps = {
  workspaceSlug: string;
  /** 资源归属实体：网格传产品/标准库 id，详情页传需求 id */
  entityId: string;
  /** 编辑器实例 id，同一屏内必须唯一 */
  editorId: string;
  value: string | null | undefined;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 网格草稿把编辑器里上传的资源登记为待提交，取消编辑时统一清理 */
  onAssetUpload?: (assetId: string) => void;
  /**
   * 暂存草稿场景要开：删图后若立刻删服务端资源，用户一取消编辑草稿就回滚了，
   * 文档里会留一个死链。留孤儿资源比留死链安全。
   */
  deferAssetDeletion?: boolean;
  containerClassName?: string;
};

/**
 * 受控的富文本输入。onChange 逐次变更就抛出，调用方自己决定什么时候落库。
 * 拿到 workspaceId 之前不渲染 —— 包装组件把它当必填项。
 *
 * 建行弹窗直接用它（不用失焦提交的 RequirementRichTextEditor）：那里 onChange 只写
 * 本地 state，而「填完描述直接点新增」时失焦与提交同一帧，晚一步就把内容丢了。
 */
export const RequirementRichTextField = observer(function RequirementRichTextField(props: TFieldProps) {
  const {
    workspaceSlug,
    entityId,
    editorId,
    value,
    onChange,
    placeholder,
    onAssetUpload,
    deferAssetDeletion,
    containerClassName,
  } = props;
  const { workspaceId, handleUpload, handleDuplicate } = useRequirementEditorAssets({
    workspaceSlug,
    entityId,
    onAssetUpload,
  });
  // initialValue 只在编辑器创建时生效，钉死在首帧，免得受控值回流时把光标顶掉
  const [pinnedInitialValue] = useState(() => normalizeRichText(value));

  if (!workspaceId) return null;

  return (
    <RichTextEditor
      id={editorId}
      editable
      initialValue={pinnedInitialValue}
      value={null}
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      dragDropEnabled
      deferAssetDeletion={deferAssetDeletion}
      onChange={(_json, html) => onChange(html)}
      placeholder={placeholder}
      searchMentionCallback={(payload) => workspaceService.searchEntity(workspaceSlug, payload)}
      uploadFile={handleUpload}
      duplicateFile={handleDuplicate}
      containerClassName={containerClassName}
    />
  );
});

/** 只读渲染：出真实排版与图片，供详情页与抽屉用 */
export const RequirementRichTextValue = observer(function RequirementRichTextValue({
  workspaceSlug,
  editorId,
  value,
  containerClassName,
}: {
  workspaceSlug: string;
  editorId: string;
  value: string | null | undefined;
  containerClassName?: string;
}) {
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString();

  if (!workspaceId) return null;

  return (
    <RichTextEditor
      id={editorId}
      editable={false}
      initialValue={normalizeRichText(value)}
      value={null}
      workspaceSlug={workspaceSlug}
      workspaceId={workspaceId}
      containerClassName={containerClassName}
    />
  );
});

/**
 * 内联编辑器，给详情页用：**失焦才向上提交**。
 *
 * 详情页的 onChange 直接就是一次 PATCH，逐次变更提交既慢又会把乐观锁的 version
 * 打乱（详情页的文本控件本来就是这个约定）。卸载时补一次提交，免得用户敲完直接
 * 关抽屉丢内容。
 */
export const RequirementRichTextEditor = observer(function RequirementRichTextEditor(props: TFieldProps) {
  const { value, onChange, containerClassName, ...rest } = props;
  const draftRef = useRef<string | null>(null);
  const commitRef = useRef<() => void>(() => {});

  commitRef.current = () => {
    const draft = draftRef.current;
    draftRef.current = null;
    if (draft === null || !hasRichTextChanged(draft, value)) return;
    onChange(draft);
  };

  useEffect(() => () => commitRef.current(), []);

  return (
    <div
      onBlur={(event) => {
        // 气泡菜单、工具条都是编辑器的子节点，焦点在内部挪动时不算失焦
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitRef.current();
      }}
    >
      <RequirementRichTextField
        {...rest}
        value={value}
        onChange={(html) => {
          draftRef.current = html;
        }}
        containerClassName={containerClassName}
      />
    </div>
  );
});

/**
 * 网格单元格：简单内容（空或一段纯文本）直接在单元格里用普通输入框改，存成 <p>…</p>；
 * 带格式、图片或多段的复杂内容仍是只读摘要，点展开按钮进弹窗用完整编辑器改。
 *
 * 列的最小宽度只有 160px，内嵌完整编辑器（气泡菜单、斜杠命令、拖拽）会把行高撑爆，
 * 所以网格里不放它 —— 与 diff、基线快照的呈现也就保持了一致。
 */
export const RequirementRichTextCell = observer(function RequirementRichTextCell({
  label,
  value,
  onChange,
  placeholder,
  editorId,
  variant = "grid",
  deferCommit = false,
  ...rest
}: TFieldProps & {
  /** 弹窗标题里的字段名 */ label: string;
  variant?: TExpandableCellVariant;
  /** 内联输入框失焦 / 回车才提交，给「onChange 即一次 PATCH」的场景用；与文本字段的 deferTextCommit 同义 */
  deferCommit?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  // 同一个字段在网格里有几十行，editorId 得再加一层实例后缀才唯一。
  // useId 带的冒号会落进 DOM 的 id 属性里，顺手去掉免得将来谁拿它做选择器。
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inlineText = toInlineText(value);
  const preview = value ? stripAndTruncateHTML(value, CELL_PREVIEW_LENGTH) : "";
  // 网格单元格旁边就是列头，空值不必再占一行提示；弹窗没有列头，才回落到占位文案
  const emptyHint = variant === "modal" ? (placeholder || t("requirement_grid.data.expand_rich_text")) : "";
  const openModal = () => setDraft(value ?? "");

  return (
    <>
      <ExpandableCell variant={variant} onExpand={openModal}>
        {inlineText === null ? (
          <button
            type="button"
            onClick={openModal}
            title={t("requirement_grid.data.expand_rich_text")}
            className="min-w-0 flex-1 text-left outline-none"
          >
            <span className={cn("block leading-5", preview ? "line-clamp-3 text-primary" : "truncate text-placeholder")}>
              {preview || emptyHint}
            </span>
          </button>
        ) : deferCommit ? (
          <DraftInput
            value={inlineText}
            onCommit={(next) => onChange(fromInlineText(next))}
            className={EXPANDABLE_CELL_INPUT_CLASS}
            placeholder={emptyHint}
          />
        ) : (
          <input
            value={inlineText}
            onChange={(event) => onChange(fromInlineText(event.target.value))}
            className={EXPANDABLE_CELL_INPUT_CLASS}
            placeholder={emptyHint}
          />
        )}
      </ExpandableCell>
      <ExpandableCellModal
        open={draft !== null}
        label={label}
        onCancel={() => setDraft(null)}
        onOk={() => {
          if (draft !== null && hasRichTextChanged(draft, value)) onChange(draft);
          setDraft(null);
        }}
      >
        <div className="vertical-scrollbar scrollbar-sm max-h-[52vh] min-h-[240px] overflow-y-auto rounded-md border border-subtle bg-surface-1">
          <RequirementRichTextField
            {...rest}
            editorId={`${editorId}-${instanceId}`}
            value={draft}
            onChange={setDraft}
            placeholder={placeholder}
            deferAssetDeletion
            containerClassName="min-h-[240px] pt-3 pr-3 text-13"
          />
        </div>
      </ExpandableCellModal>
    </>
  );
});
