import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@plane/propel/button";
import { AlertModalCore } from "@plane/ui";
import { TypeIcon } from "@/components/common/type-icon-picker";
import { useIssueTypeLayoutEditor } from "@/hooks/use-issue-type-layout-editor";
import type { TLayoutSave, TLayoutSelection } from "@/hooks/use-issue-type-layout-editor";
import type { TIssueType, TTypeExtraField } from "@/services/project/project-issue-type.service";
import { LayoutCanvas } from "./canvas";
import { LayoutInspector } from "./inspector";
import { LayoutPreview } from "./preview";

type TProps = {
  issueType: TIssueType;
  fields: TTypeExtraField[];
  onSave: TLayoutSave;
  /** 保存成功、取消或返回后关闭 */
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * 字段布局设计器：盖住整个应用的全屏编辑界面，左边画布、右边设置栏。
 * 草稿只在打开期间存在：「保存」写入并关闭，「取消」/ 返回放弃修改并关闭。
 */
export function IssueTypeLayoutDesigner({ issueType, fields, onSave, onClose, onDirtyChange }: TProps) {
  const state = useIssueTypeLayoutEditor(issueType, fields, onSave);
  const [preview, setPreview] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removal, setRemoval] = useState<TLayoutSelection | null>(null);
  const editable = !state.isSaving;
  useEffect(() => {
    onDirtyChange?.(state.isDirty);
    return () => onDirtyChange?.(false);
  }, [state.isDirty, onDirtyChange]);

  const requestClose = () => (state.isDirty ? setLeaving(true) : onClose());
  const removalFieldCount = (node: TLayoutSelection) => {
    const page = state.draft.pages.find((item) => item.id === node.id);
    if (node.kind === "page" && page)
      return page.fields.length + page.groups.reduce((sum, group) => sum + group.fields.length, 0);
    return state.areas.find((item) => item.ref.kind === "group" && item.ref.id === node.id)?.area.fields.length ?? 0;
  };
  /** 空的分组 / 页面直接移除；里面有字段时先确认去向 */
  const requestRemove = (node: TLayoutSelection) =>
    removalFieldCount(node) ? setRemoval(node) : state.removeNode(node);
  const handleSave = async () => {
    if (await state.save()) onClose();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="字段布局" className="fixed inset-0 z-[25] flex flex-col bg-surface-2">
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-subtle bg-surface-1 px-5">
        <button
          type="button"
          aria-label="返回"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-strong text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          onClick={requestClose}
        >
          <ArrowLeft className="size-4" />
        </button>
        <TypeIcon
          iconProps={issueType.logo_props?.icon}
          className="ml-1 size-[34px] shrink-0 rounded-[9px] bg-layer-1"
          iconClassName="size-[18px]"
        />
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="truncate text-16 font-semibold text-primary">{issueType.name}</span>
          <span className="shrink-0 text-14 text-tertiary">字段布局</span>
        </div>
        <span className="flex-1" />
        {state.isDirty && <span className="mr-1.5 shrink-0 text-13 text-tertiary">有未保存的修改</span>}
        <Button variant="ghost" size="xl" className="px-3" disabled={!editable} onClick={() => setResetting(true)}>
          恢复默认
        </Button>
        <Button variant="secondary" size="xl" className="px-3" onClick={() => setPreview(true)}>
          预览
        </Button>
        <span aria-hidden="true" className="mx-1 h-5 border-l border-strong" />
        <Button variant="secondary" size="xl" className="px-3" disabled={!editable} onClick={requestClose}>
          取消
        </Button>
        <Button
          variant="primary"
          size="xl"
          className="px-3"
          disabled={!state.isDirty || state.isSaving}
          onClick={() => void handleSave()}
        >
          {state.isSaving ? "保存中…" : "保存"}
        </Button>
      </header>
      {state.error && (
        <p role="alert" className="shrink-0 border-b border-subtle bg-danger-subtle px-5 py-2 text-13 text-danger-primary">
          {state.error}
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <main className="vertical-scrollbar min-w-0 flex-1 overflow-y-auto px-10 py-7">
          <div className="mx-auto max-w-[1180px] rounded-[14px] border border-subtle bg-surface-1 px-11 pt-[34px] pb-[30px] shadow-raised-100">
            <LayoutCanvas
              layout={state.draft}
              fields={fields}
              editor={state}
              editable={editable}
              onRemove={requestRemove}
            />
          </div>
        </main>
        <LayoutInspector state={state} editable={editable} onRemove={requestRemove} />
      </div>

      {preview && <LayoutPreview layout={state.draft} fields={fields} onClose={() => setPreview(false)} />}
      <AlertModalCore
        isOpen={Boolean(removal)}
        isSubmitting={false}
        handleClose={() => setRemoval(null)}
        handleSubmit={() => {
          if (removal) state.removeNode(removal);
          setRemoval(null);
        }}
        variant="danger"
        title={removal?.kind === "page" ? "移除页面" : "移除分组"}
        primaryButtonText={{ default: "移除", loading: "移除中" }}
        secondaryButtonText="取消"
        content={
          removal?.kind === "page"
            ? `页面内的 ${removal ? removalFieldCount(removal) : 0} 个字段将移至描述下方，页内分组一并移除。字段定义与已有数据不受影响。`
            : `分组内的 ${removal ? removalFieldCount(removal) : 0} 个字段将移至分组所在位置的未分组区域。字段定义与已有数据不受影响。`
        }
      />
      <AlertModalCore
        isOpen={resetting}
        isSubmitting={false}
        handleClose={() => setResetting(false)}
        handleSubmit={() => {
          state.reset();
          setResetting(false);
        }}
        variant="danger"
        title="恢复默认布局"
        primaryButtonText={{ default: "恢复默认", loading: "恢复中" }}
        secondaryButtonText="取消"
        content="将移除全部分组和页面，全部字段按原顺序排在描述下方，每行 4 个。保存后生效。"
      />
      <AlertModalCore
        isOpen={leaving}
        isSubmitting={false}
        handleClose={() => setLeaving(false)}
        handleSubmit={onClose}
        variant="danger"
        title="放弃修改"
        primaryButtonText={{ default: "放弃修改", loading: "处理中" }}
        secondaryButtonText="继续编辑"
        content="当前布局有未保存的修改，放弃后无法恢复。"
      />
    </div>,
    document.body
  );
}
