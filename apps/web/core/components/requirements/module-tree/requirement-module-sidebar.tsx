"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementModule } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import type { TRequirementModulesStore } from "@/hooks/store/use-requirement-modules";
import { RequirementModuleTree } from "./module-tree";

const MIN_WIDTH = 200;
const MAX_WIDTH = 300;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? fallback;
  }
  if (typeof error === "string") return error;
  return fallback;
};

/** 在当前树里找出某个模块及其全部后代的 id —— 删除后判断选中是否失效 */
const collectSubtreeIds = (modules: TRequirementModule[], moduleId: string): Set<string> => {
  const result = new Set<string>();
  const collect = (node: TRequirementModule) => {
    result.add(node.id);
    node.children?.forEach(collect);
  };
  const find = (nodes: TRequirementModule[]): TRequirementModule | null => {
    for (const node of nodes) {
      if (node.id === moduleId) return node;
      const hit = find(node.children ?? []);
      if (hit) return hit;
    }
    return null;
  };
  const target = find(modules);
  if (target) collect(target);
  else result.add(moduleId);
  return result;
};

type TProps = {
  store: TRequirementModulesStore;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  /** 无写权限的成员仍可按模块过滤，只是没有增删改入口 */
  readonly?: boolean;
};

/**
 * 库页 / 产品页左侧的可编辑模块树侧栏：建 / 重命名 / 删模块 + 点击过滤。
 * 宽度可拖拽（200–300px，与 QA 用例页一致）。
 */
export const RequirementModuleSidebar = (props: TProps) => {
  const { store, selectedModuleId, onSelect, readonly = false } = props;
  const { t } = useTranslation();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [width, setWidth] = useState(240);
  const widthRef = useRef(width);

  const onMouseDownResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + moveEvent.clientX - startX));
      widthRef.current = next;
      setWidth(next);
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleCreate = useCallback(
    async (parentId: string | null, name: string) => {
      try {
        await store.createModule({ name, parent: parentId });
      } catch (error) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: getErrorMessage(error, t("requirement_modules.toast.create_failed")),
        });
      }
    },
    [store, t]
  );

  const handleRename = useCallback(
    async (moduleId: string, name: string) => {
      try {
        await store.updateModule(moduleId, { name });
      } catch (error) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: getErrorMessage(error, t("requirement_modules.toast.rename_failed")),
        });
      }
    },
    [store, t]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      // 选中项落在被删子树里时要退回「全部」，子树关系得在删除前从当前树里算
      const doomedIds = collectSubtreeIds(store.modules, deleteTarget.id);
      await store.deleteModule(deleteTarget.id);
      if (selectedModuleId && doomedIds.has(selectedModuleId)) onSelect(null);
      setDeleteTarget(null);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: getErrorMessage(error, t("requirement_modules.toast.delete_failed")),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, onSelect, selectedModuleId, store, t]);

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-subtle"
      style={{ width, minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
    >
      <div
        onMouseDown={onMouseDownResize}
        className="absolute top-0 right-0 z-10 h-full w-1.5"
        style={{ cursor: "col-resize" }}
      />
      <div className="px-3 pt-3 pb-1.5 text-caption-sm-medium text-tertiary">
        {t("requirement_modules.sidebar_label")}
      </div>
      <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <RequirementModuleTree
          modules={store.modules}
          total={store.total}
          selectedModuleId={selectedModuleId}
          onSelect={onSelect}
          readonly={readonly}
          onCreate={handleCreate}
          onRename={handleRename}
          onDelete={setDeleteTarget}
        />
      </div>
      <AlertModalCore
        isOpen={deleteTarget !== null}
        handleClose={() => setDeleteTarget(null)}
        handleSubmit={() => void handleDeleteConfirm()}
        isSubmitting={isDeleting}
        title={t("requirement_modules.delete_confirm_title")}
        content={t("requirement_modules.delete_confirm_content", { name: deleteTarget?.name ?? "" })}
        // AlertModalCore 的按钮默认是英文硬编码
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </aside>
  );
};
