"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderLock, FolderPlus, Lock, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementModule } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleTreePanel,
  UNASSIGNED_MODULE_KEY,
  appendUnassignedNode,
  collectAncestorKeys,
  indexModuleTree,
  isInSubtree,
  type TModuleTreeDropEvent,
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

/** markLocked：库绑了产品分类时，来自分类的一级模块换锁形文件夹图标，且不可拖动 */
const toTreeNodes = (list: TRequirementModule[], markLocked: boolean): TModuleTreeNode[] =>
  list.map((item) => {
    const locked = markLocked && Boolean(item.locked);
    return {
      key: item.id,
      label: item.name,
      count: item.count,
      icon: locked ? <FolderLock className="size-3.5" strokeWidth={1.75} /> : undefined,
      draggable: locked ? false : undefined,
      children: toTreeNodes(item.children ?? [], markLocked),
    };
  });

const collectLockedKeys = (list: TRequirementModule[], keys = new Set<string>()) => {
  for (const item of list) {
    if (item.locked) keys.add(item.id);
    if (item.children?.length) collectLockedKeys(item.children, keys);
  }
  return keys;
};

type TProps = {
  store: TRequirementModulesStore;
  selectedModuleId: string | null;
  onSelect: (moduleId: string | null) => void;
  /** 无写权限的成员仍可按模块过滤，只是没有增删改入口 */
  readonly?: boolean;
  /**
   * 标准库绑了产品分类时传分类名：第一层模块由分类统一维护，树头不再能建一级模块，
   * locked 节点只能建子模块（产品页不传，行为不变）。
   */
  lockedRootCategoryName?: string;
  /** 拖动模块成功后回调：选中的模块子树可能变了，页面据此重拉右侧列表 */
  onModuleMoved?: () => void;
};

/**
 * 库页 / 产品页左侧的可编辑模块树侧栏：建 / 重命名 / 删 / 拖动（换父级、排序）模块 + 点击过滤。
 * 外壳与树体用测试管理共用的 ModuleTreePanel（可拖宽、可收起、可搜索），行样式同项目研发需求页。
 */
export const RequirementModuleSidebar = (props: TProps) => {
  const { store, selectedModuleId, onSelect, readonly = false, lockedRootCategoryName, onModuleMoved } = props;
  const isRootLocked = Boolean(lockedRootCategoryName);
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [editing, setEditing] = useState<TModuleTreeEditing>(null);
  const [deleteTarget, setDeleteTarget] = useState<TModuleTreeNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const treeNodes = useMemo(() => toTreeNodes(store.modules, isRootLocked), [store.modules, isRootLocked]);
  const lockedKeys = useMemo(
    () => (isRootLocked ? collectLockedKeys(store.modules) : new Set<string>()),
    [store.modules, isRootLocked]
  );
  const isUnassignedSelected = selectedModuleId === UNASSIGNED_MODULE_KEY;
  // 末尾的「未归类」（一个模块都没有时不出，见 appendUnassignedNode）
  const displayNodes = useMemo(
    () =>
      appendUnassignedNode(treeNodes, store.unassigned, { keepWhenEmpty: isUnassignedSelected }).map((node) =>
        node.key === UNASSIGNED_MODULE_KEY ? { ...node, label: t("requirement_modules.unassigned") } : node
      ),
    [treeNodes, store.unassigned, isUnassignedSelected, t]
  );
  const { nodeByKey, parentByKey } = useMemo(() => indexModuleTree(displayNodes), [displayNodes]);

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

  /**
   * 拖拽落点 → 移动接口参数：落在模块上 = 移进去（追加到末尾），落在「全部」上 = 移到一级，
   * 落在两行之间 = 与目标同级、插到它前 / 后。
   */
  const handleDrop = async ({ dragKey, targetKey, position }: TModuleTreeDropEvent) => {
    if (readonly) return;
    const targetParentId =
      position === "into" ? (targetKey === MODULE_TREE_ROOT_KEY ? null : targetKey) : parentByKey.get(targetKey);
    if (targetParentId === undefined) return;
    // 有产品分类的库：第一层由分类维护，不能把模块提到一级，也不能在一级之间排序
    if (isRootLocked && targetParentId === null) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("requirement_modules.locked_by_category", { name: lockedRootCategoryName ?? "" }),
      });
      return;
    }
    try {
      await store.moveModule({
        module_id: dragKey,
        target_parent_id: targetParentId,
        ...(position === "into" ? {} : { anchor_id: targetKey, placement: position }),
      });
      if (targetParentId) setExpandedKeys((prev) => (prev.includes(targetParentId) ? prev : [...prev, targetParentId]));
      if (selectedModuleId && selectedModuleId !== UNASSIGNED_MODULE_KEY) onModuleMoved?.();
    } catch (error) {
      showError(error, "requirement_modules.toast.move_failed");
    }
  };

  const getMenuItems = (node: TModuleTreeNode): TModuleTreeMenuItem[] => {
    if (readonly) return [];
    const addChild: TModuleTreeMenuItem = {
      key: "add",
      label: t("requirement_modules.add_child"),
      icon: <FolderPlus className="size-3.5" strokeWidth={1.75} />,
      onClick: () => startCreate(node.key),
    };
    // 来自产品分类的一级模块：只能往下建，改名 / 删除要去分类里做
    if (lockedKeys.has(node.key)) {
      return [
        addChild,
        {
          key: "locked-note",
          label: t("requirement_modules.locked_by_category", { name: lockedRootCategoryName ?? "" }),
          icon: <Lock className="size-3" strokeWidth={1.75} />,
          note: true,
          onClick: () => undefined,
        },
      ];
    }
    return [
      addChild,
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
  };

  const allLabel = t("requirement_modules.all");

  return (
    <>
      <ModuleTreePanel
        title={t("requirement_modules.sidebar_label")}
        root={{ label: allLabel, count: store.total }}
        nodes={displayNodes}
        selectedKey={selectedModuleId ?? MODULE_TREE_ROOT_KEY}
        onSelect={(key) => onSelect(key === MODULE_TREE_ROOT_KEY ? null : key)}
        expandedKeys={expandedKeys}
        onExpandedKeysChange={setExpandedKeys}
        editing={editing}
        onEditCommit={(value) => void handleEditCommit(value)}
        onEditCancel={() => setEditing(null)}
        getMenuItems={getMenuItems}
        dragMode={readonly ? "none" : "sort"}
        onDrop={(event) => void handleDrop(event)}
        onAddRoot={readonly || isRootLocked ? undefined : () => startCreate(MODULE_TREE_ROOT_KEY)}
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
