/**
 * 需求富文本的三种形态：只读渲染、内联编辑器、网格单元格（摘要 + 弹窗编辑）。
 *
 * 自定义 rich_text 字段与内置「描述」列共用这一份，两处的富文本长得不一样是这类
 * 表单最容易积累的不一致。后端对两者都走同一套 HTML 消毒（validate_html_content），
 * 前端也就不该分家。
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Maximize2 } from "lucide-react";
import { Modal } from "antd";
import { useTranslation } from "@plane/i18n";
import { EFileAssetType } from "@plane/types";
import { cn, stripAndTruncateHTML } from "@plane/utils";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";

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
 * 网格单元格：平时是纯文本摘要，点展开按钮进弹窗用完整编辑器改。
 *
 * 列的最小宽度只有 160px，内嵌完整编辑器（气泡菜单、斜杠命令、拖拽）会把行高撑爆，
 * 所以网格里只给摘要 —— 与 diff、基线快照的呈现也就保持了一致。
 */
export const RequirementRichTextCell = observer(function RequirementRichTextCell({
  label,
  value,
  onChange,
  placeholder,
  editorId,
  variant = "grid",
  ...rest
}: TFieldProps & {
  /** 弹窗标题里的字段名 */ label: string;
  /** 静息底色的配方，与 FIELD_INPUT_CLASS 同名同义 */
  variant?: "grid" | "detail" | "modal";
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  // 同一个字段在网格里有几十行，editorId 得再加一层实例后缀才唯一。
  // useId 带的冒号会落进 DOM 的 id 属性里，顺手去掉免得将来谁拿它做选择器。
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const preview = value ? stripAndTruncateHTML(value, CELL_PREVIEW_LENGTH) : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setDraft(value ?? "")}
        title={t("requirement_grid.data.expand_rich_text")}
        className={cn(
          "focus-visible:border-accent-primary group flex min-h-8 w-full min-w-0 items-start gap-1 rounded-md border px-2 py-1.5 text-left transition-colors duration-150 outline-none motion-reduce:transition-none",
          // 弹窗里字段密集且没有相邻单元格衬托，静息就得看得出是个可点的输入框
          variant === "modal"
            ? "border-subtle bg-surface-1 hover:border-strong"
            : "border-transparent bg-transparent hover:border-subtle hover:bg-layer-1 focus-visible:bg-surface-1"
        )}
      >
        <span
          className={cn(
            "min-w-0 flex-1 text-14 leading-5",
            preview ? "line-clamp-3 text-primary" : "truncate text-placeholder"
          )}
        >
          {preview || placeholder || t("requirement_grid.data.expand_rich_text")}
        </span>
        <Maximize2 className="mt-0.5 size-3.5 shrink-0 text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </button>
      <Modal
        open={draft !== null}
        title={t("requirement_grid.data.edit_rich_text", { field: label })}
        onCancel={() => setDraft(null)}
        onOk={() => {
          if (draft !== null && hasRichTextChanged(draft, value)) onChange(draft);
          setDraft(null);
        }}
        okText={t("confirm")}
        cancelText={t("cancel")}
        width={720}
        modalRender={(modal) => <div data-prevent-outside-click>{modal}</div>}
        destroyOnClose
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
      </Modal>
    </>
  );
});
