"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementModule } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleTreePanel,
  collectAncestorKeys,
  indexModuleTree,
  isInSubtree,
  type TModuleTreeEditing,
  type TModuleTreeMenuItem,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
import type { TRequirementModulesStore } from "@/hooks/store/use-requirement-modules";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? fallback;
  }
  if (typeof error === "string") return error;
  return fallback;
};

const toTreeNodes = (list: TRequirementModule[]): TModuleTreeNode[] =>
  list.map((item) => ({
    key: item.id,
    label: item.name,
    count: item.count,
    children: toTreeNodes(item.children ?? []),
  }));

type TProps = {
  store: TRequirementModulesStore;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  /** 无写权限的成员仍可按模块过滤，只是没有增删改入口 */
  readonly?: boolean;
};

/**
 * 库页 / 产品页左侧的可编辑模块树侧栏：建 / 重命名 / 删模块 + 点击过滤。
 * 外壳与树体用测试管理共用的 ModuleTreePanel（可拖宽、可收起、可搜索），行样式同项目研发需求页。
 */
export const RequirementModuleSidebar = (props: TProps) => {
  const { store, selectedModuleId, onSelect, readonly = false } = props;
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [editing, setEditing] = useState<TModuleTreeEditing>(null);
  const [deleteTarget, setDeleteTarget] = useState<TModuleTreeNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const treeNodes = useMemo(() => toTreeNodes(store.modules), [store.modules]);
  const { nodeByKey } = useMemo(() => indexModuleTree(treeNodes), [treeNodes]);

  // 选中项（通常来自 URL）藏在收起的分支里时，把它的祖先展开；只在第一次拿到树时做
  const initialExpandDone = useRef(false);
  useEffect(() => {
    if (initialExpandDone.current || !selectedModuleId || treeNodes.length === 0) return;
    initialExpandDone.current = true;
    const ancestors = collectAncestorKeys(treeNodes, selectedModuleId);
    if (ancestors?.length) setExpandedKeys((prev) => Array.from(new Set([...prev, ...ancestors])));
  }, [selectedModuleId, treeNodes]);

  const showError = useCallback(
    (error: unknown, fallbackKey: string) =>
      setToast({ type: TOAST_TYPE.ERROR, title: t("error"), message: getErrorMessage(error, t(fallbackKey)) }),
    [t]
  );

  const startCreate = (parentKey: string) => {
    setEditing({ kind: "create", parentKey });
    if (parentKey !== MODULE_TREE_ROOT_KEY)
      setExpandedKeys((prev) => (prev.includes(parentKey) ? prev : [...prev, parentKey]));
  };

  const handleEditCommit = async (value: string) => {
    const current = editing;
    setEditing(null);
    const name = value.trim();
    if (!current || !name || readonly) return;
    if (current.kind === "create") {
      try {
        await store.createModule({
          name,
          parent: current.parentKey === MODULE_TREE_ROOT_KEY ? null : current.parentKey,
        });
      } catch (error) {
        showError(error, "requirement_modules.toast.create_failed");
      }
      return;
    }
    if (name === current.initialValue) return;
    try {
      await store.updateModule(current.key, { name });
    } catch (error) {
      showError(error, "requirement_modules.toast.rename_failed");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      // 选中项落在被删子树里时要退回「全部」，子树关系得在删除前从当前树里算
      const selectedWillBeGone =
        selectedModuleId !== null &&
        (selectedModuleId === deleteTarget.key || isInSubtree(deleteTarget, selectedModuleId));
      await store.deleteModule(deleteTarget.key);
      if (selectedWillBeGone) onSelect(null);
      setDeleteTarget(null);
    } catch (error) {
      showError(error, "requirement_modules.toast.delete_failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const getMenuItems = (node: TModuleTreeNode): TModuleTreeMenuItem[] =>
    readonly
      ? []
      : [
          {
            key: "add",
            label: t("requirement_modules.add_child"),
            icon: <FolderPlus className="size-3.5" strokeWidth={1.75} />,
            onClick: () => startCreate(node.key),
          },
          {
            key: "rename",
            label: t("requirement_modules.rename"),
            icon: <Pencil className="size-3.5" strokeWidth={1.75} />,
            onClick: () => setEditing({ kind: "rename", key: node.key, initialValue: node.label }),
          },
          {
            key: "delete",
            label: t("requirement_modules.delete"),
            icon: <Trash2 className="size-3.5" strokeWidth={1.75} />,
            danger: true,
            onClick: () => setDeleteTarget(node),
          },
        ];

  const allLabel = t("requirement_modules.all");

  return (
    <>
      <ModuleTreePanel
        title={t("requirement_modules.sidebar_label")}
        root={{ label: allLabel, count: store.total }}
        nodes={treeNodes}
        selectedKey={selectedModuleId ?? MODULE_TREE_ROOT_KEY}
        onSelect={(key) => onSelect(key === MODULE_TREE_ROOT_KEY ? null : key)}
        expandedKeys={expandedKeys}
        onExpandedKeysChange={setExpandedKeys}
        editing={editing}
        onEditCommit={(value) => void handleEditCommit(value)}
        onEditCancel={() => setEditing(null)}
        getMenuItems={getMenuItems}
        onAddRoot={readonly ? undefined : () => startCreate(MODULE_TREE_ROOT_KEY)}
        railLabel={(selectedModuleId && nodeByKey.get(selectedModuleId)?.label) || allLabel}
        loading={store.isLoading}
        emptyText={t("requirement_modules.empty")}
      />
      <AlertModalCore
        isOpen={deleteTarget !== null}
        handleClose={() => setDeleteTarget(null)}
        handleSubmit={() => void handleDeleteConfirm()}
        isSubmitting={isDeleting}
        title={t("requirement_modules.delete_confirm_title")}
        content={t("requirement_modules.delete_confirm_content", { name: deleteTarget?.label ?? "" })}
        // AlertModalCore 的按钮默认是英文硬编码
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
};
