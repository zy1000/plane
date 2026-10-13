import { useState } from "react";
import type { ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { EFileAssetType } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ModalFieldLabel } from "@/components/common/form-modal";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { WorkspaceService } from "@/services/workspace.service";
import { RISK_I18N } from "../constants";

const workspaceService = new WorkspaceService();

export type TRiskEditorScope = {
  workspaceSlug: string;
  workspaceId: string;
  projectId: string;
  /** 编辑器只认 initialValue，弹窗每次打开换一次 key 重挂 */
  editorVersion: number;
};

/** 系统富文本（无常驻工具栏，选中文字出气泡菜单），外面一层圆角边框盒 */
const RichTextBox = ({
  editorKey,
  id,
  html,
  boxClassName,
  scrollClassName,
  containerClassName,
  hasError = false,
  onChange,
  workspaceSlug,
  workspaceId,
  projectId,
}: Omit<TRiskEditorScope, "editorVersion"> & {
  editorKey: string;
  id: string;
  html: string;
  boxClassName?: string;
  /** 框内滚动区的高度上限（如 max-h-[320px]）；放大窗口里不传，撑满 */
  scrollClassName?: string;
  containerClassName: string;
  hasError?: boolean;
  onChange: (html: string) => void;
}) => {
  const { t } = useTranslation();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border bg-layer-2 transition-colors focus-within:border-accent-strong",
        hasError ? "border-danger-strong" : "border-subtle-1",
        boxClassName
      )}
    >
      <div data-modal-wheel-scroll className={cn("vertical-scrollbar scrollbar-sm overflow-y-auto", scrollClassName)}>
      <RichTextEditor
        key={editorKey}
        id={id}
        editable
        initialValue={html}
        value={null}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        dragDropEnabled
        deferAssetDeletion
        onChange={(_json, nextHtml) => onChange(nextHtml)}
        placeholder={() => t(`${RISK_I18N}.form.editor_placeholder`)}
        searchMentionCallback={(payload) => workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: projectId })}
        // 风险还没有 id：图片先挂在项目描述这一类下，保存时后端按 html 里的引用认领
        uploadFile={async (blockId, file) => {
          const { asset_id } = await uploadEditorAsset({
            blockId,
            data: { entity_identifier: projectId, entity_type: EFileAssetType.PROJECT_DESCRIPTION },
            file,
            projectId,
            workspaceSlug,
          });
          return asset_id;
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
        containerClassName={containerClassName}
      />
      </div>
    </div>
  );
};

/**
 * 一段富文本字段：字段名一行（右侧「放大编辑」）+ 编辑框。
 *
 * 放大编辑是一个大弹窗，里面是同一份内容的另一个编辑器，改动实时写回表单；关掉时让行内编辑器
 * 换 key 重挂，拿到放大时改过的内容（行内编辑器只认 initialValue）。
 */
export const RiskRichTextField = ({
  id,
  label,
  required = false,
  note,
  error,
  html,
  minHeightClass,
  maxHeightClass,
  onChange,
  scope,
}: {
  id: string;
  label: string;
  required?: boolean;
  /** 字段名后的小字说明；出错时换成红字错误 */
  note?: ReactNode;
  error?: string;
  html: string;
  minHeightClass: string;
  /** 行内框的高度上限：超出在框里滚动，长内容用「放大编辑」 */
  maxHeightClass: string;
  onChange: (html: string) => void;
  scope: TRiskEditorScope;
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  /** 每关一次放大窗口加一：行内编辑器重挂，放大窗口下次打开也是新的 */
  const [expandRound, setExpandRound] = useState(0);
  const { editorVersion, ...editorScope } = scope;

  const closeExpanded = () => {
    setIsExpanded(false);
    setExpandRound((current) => current + 1);
  };

  const expandLabel = t(`${RISK_I18N}.form.expand`);

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <ModalFieldLabel
          required={required}
          note={error ? <span className="text-danger-primary">{error}</span> : note}
        >
          <span className={error ? "text-danger-primary" : undefined}>{label}</span>
        </ModalFieldLabel>
        <Tooltip tooltipContent={expandLabel} position="top">
          <button
            type="button"
            aria-label={`${expandLabel} · ${label}`}
            onClick={() => setIsExpanded(true)}
            className="-mt-1 grid size-6 shrink-0 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </Tooltip>
      </div>

      <RichTextBox
        editorKey={`${id}-${editorVersion}-${expandRound}`}
        id={`risk-form-${id}`}
        html={html}
        hasError={Boolean(error)}
        scrollClassName={maxHeightClass}
        containerClassName={cn("px-3.5 pt-3 pb-3 text-14", minHeightClass)}
        onChange={onChange}
        {...editorScope}
      />

      <ModalCore
        isOpen={isExpanded}
        handleClose={closeExpanded}
        position={EModalPosition.CENTER}
        width={EModalWidth.VIIXL}
        className="rounded-2xl"
      >
        <div className="flex h-[min(86vh,56rem)] min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-2 px-6 pt-5 pb-3">
            <h3 className="text-16 font-semibold text-primary">
              {label}
              {required && <span className="ml-0.5 text-danger-primary">*</span>}
            </h3>
            {note && !error && <span className="text-12 text-placeholder">{note}</span>}
            <button
              type="button"
              onClick={closeExpanded}
              aria-label={t("close")}
              className="ml-auto grid size-8 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <div data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
            {isExpanded && (
              <RichTextBox
                editorKey={`${id}-expanded-${expandRound}`}
                id={`risk-form-${id}-expanded`}
                html={html}
                boxClassName="min-h-full"
                containerClassName="min-h-[60vh] px-5 pt-4 pb-4 text-14"
                onChange={onChange}
                {...editorScope}
              />
            )}
          </div>
          <div className="flex shrink-0 justify-end border-t border-subtle px-6 py-3.5">
            <Button type="button" variant="primary" size="lg" onClick={closeExpanded}>
              {t(`${RISK_I18N}.form.expand_done`)}
            </Button>
          </div>
        </div>
      </ModalCore>
    </div>
  );
};
