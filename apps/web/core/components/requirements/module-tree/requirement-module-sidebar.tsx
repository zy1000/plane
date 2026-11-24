"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderLock, FolderPlus, Layers, ListPlus, Lock, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TCreateRequirementModulePayload,
  TMoveRequirementModulePayload,
  TRequirementModule,
  TUpdateRequirementModulePayload,
} from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleBulkCreateModal,
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
import type { TBulkModuleItem, TBulkModuleResult } from "@/services/qa/module-bulk.types";

/**
 * 侧栏用到的模块树数据入口：需求模块（useRequirementModules）与用例库模块
 * （useCaseRepositoryModules）都满足这个形状。
 */
export type TModuleSidebarStore = {
  modules: TRequirementModule[];
  total: number;
  unassigned: number;
  isLoading: boolean;
  createModule: (payload: TCreateRequirementModulePayload) => Promise<unknown>;
  /** 有则出「批量新建」入口 */
  bulkCreateModules?: (parent: string | null, items: TBulkModuleItem[]) => Promise<TBulkModuleResult>;
  updateModule: (moduleId: string, payload: TUpdateRequirementModulePayload) => Promise<unknown>;
  moveModule: (payload: TMoveRequirementModulePayload) => Promise<unknown>;
  deleteModule: (moduleId: string) => Promise<void>;
};

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
  store: TModuleSidebarStore;
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
  /** 「全部」行的文字，默认「全部需求」 */
  allLabel?: string;
  /** 删除确认的正文，默认按需求的口径 */
  getDeleteConfirmContent?: (node: TModuleTreeNode) => string;
  /**
   * 产品属于产品集时，引用需求所在的产品集模块：作为同一棵树末尾的一个分组节点（名称 = 产品集名），
   * 组内模块只读（不可拖、不能当落点、没有 ⋯ 菜单），点选照常按模块筛列表。
   */
  referencedGroup?: { label: string; count?: number; modules: TRequirementModule[] };
};

/** 产品集分组节点本身不对应模块：点它只展开 / 收起 */
const REFERENCED_GROUP_KEY = "__product_set_group__";

const toReadonlyTreeNodes = (list: TRequirementModule[]): TModuleTreeNode[] =>
  list.map((item) => ({
    key: item.id,
    label: item.name,
    count: item.count,
    virtual: true,
    children: toReadonlyTreeNodes(item.children ?? []),
  }));

/**
 * 库页 / 产品页左侧的可编辑模块树侧栏：建 / 重命名 / 删 / 拖动（换父级、排序）模块 + 点击过滤。
 * 外壳与树体用测试管理共用的 ModuleTreePanel（可拖宽、可收起、可搜索），行样式同项目研发需求页。
 */
export const RequirementModuleSidebar = (props: TProps) => {
  const {
    store,
    selectedModuleId,
    onSelect,
    readonly = false,
    lockedRootCategoryName,
    onModuleMoved,
    allLabel: allLabelProp,
    getDeleteConfirmContent,
    referencedGroup,
  } = props;
  const isRootLocked = Boolean(lockedRootCategoryName);
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [editing, setEditing] = useState<TModuleTreeEditing>(null);
  const [deleteTarget, setDeleteTarget] = useState<TModuleTreeNode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  /** 批量新建弹窗：undefined = 关；null = 顶级；string = 上级模块 */
  const [bulkParent, setBulkParent] = useState<string | null | undefined>(undefined);
  const canBulk = !readonly && Boolean(store.bulkCreateModules);

  const treeNodes = useMemo(() => toTreeNodes(store.modules, isRootLocked), [store.modules, isRootLocked]);
  const lockedKeys = useMemo(
    () => (isRootLocked ? collectLockedKeys(store.modules) : new Set<string>()),
    [store.modules, isRootLocked]
  );
  const isUnassignedSelected = selectedModuleId === UNASSIGNED_MODULE_KEY;
  // 末尾的「未归类」（一个模块都没有时不出，见 appendUnassignedNode）
  const referencedNode = useMemo<TModuleTreeNode | null>(
    () =>
      referencedGroup && referencedGroup.modules.length > 0
        ? {
            key: REFERENCED_GROUP_KEY,
            label: referencedGroup.label,
            count: referencedGroup.count,
            icon: <Layers className="size-3.5" strokeWidth={1.75} />,
            virtual: true,
            children: toReadonlyTreeNodes(referencedGroup.modules),
          }
        : null,
    [referencedGroup]
  );
  const displayNodes = useMemo(() => {
    const own = appendUnassignedNode(treeNodes, store.unassigned, { keepWhenEmpty: isUnassignedSelected }).map(
      (node) => (node.key === UNASSIGNED_MODULE_KEY ? { ...node, label: t("requirement_modules.unassigned") } : node)
    );
    return referencedNode ? [...own, referencedNode] : own;
  }, [treeNodes, store.unassigned, isUnassignedSelected, referencedNode, t]);
  const { nodeByKey, parentByKey } = useMemo(() => indexModuleTree(displayNodes), [displayNodes]);

  // 产品集分组默认展开：引用进来的模块一眼可见
  useEffect(() => {
    if (referencedNode)
      setExpandedKeys((prev) => (prev.includes(REFERENCED_GROUP_KEY) ? prev : [...prev, REFERENCED_GROUP_KEY]));
  }, [referencedNode]);

  // 选中项（通常来自 URL）藏在收起的分支里时，把它的祖先展开；只在第一次拿到树时做
  const initialExpandDone = useRef(false);
  useEffect(() => {
    if (initialExpandDone.current || !selectedModuleId || displayNodes.length === 0) return;
    initialExpandDone.current = true;
    const ancestors = collectAncestorKeys(displayNodes, selectedModuleId);
    if (ancestors?.length) setExpandedKeys((prev) => Array.from(new Set([...prev, ...ancestors])));
  }, [selectedModuleId, displayNodes]);

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
    const addChildItems: TModuleTreeMenuItem[] = [
      {
        key: "add",
        label: t("requirement_modules.add_child"),
        icon: <FolderPlus className="size-3.5" strokeWidth={1.75} />,
        onClick: () => startCreate(node.key),
      },
      ...(canBulk
        ? [
            {
              key: "bulk-add",
              label: "批量添加子模块",
              icon: <ListPlus className="size-3.5" strokeWidth={1.75} />,
              onClick: () => setBulkParent(node.key),
            },
          ]
        : []),
    ];
    // 来自产品分类的一级模块：只能往下建，改名 / 删除要去分类里做
    if (lockedKeys.has(node.key)) {
      return [
        ...addChildItems,
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
      ...addChildItems,
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

  const allLabel = allLabelProp ?? t("requirement_modules.all");

  return (
    <>
      <ModuleTreePanel
        title={t("requirement_modules.sidebar_label")}
        root={{ label: allLabel, count: store.total }}
        nodes={displayNodes}
        selectedKey={selectedModuleId ?? MODULE_TREE_ROOT_KEY}
        onSelect={(key) => {
          if (key === REFERENCED_GROUP_KEY) {
            setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
            return;
          }
          onSelect(key === MODULE_TREE_ROOT_KEY ? null : key);
        }}
        expandedKeys={expandedKeys}
        onExpandedKeysChange={setExpandedKeys}
        editing={editing}
        onEditCommit={(value) => void handleEditCommit(value)}
        onEditCancel={() => setEditing(null)}
        getMenuItems={getMenuItems}
        dragMode={readonly ? "none" : "sort"}
        onDrop={(event) => void handleDrop(event)}
        onAddRoot={readonly || isRootLocked ? undefined : () => startCreate(MODULE_TREE_ROOT_KEY)}
        onBulkAdd={
          canBulk
            ? () =>
                // 选中的是「未归类」或产品集分组里的模块（都是只读节点）时，批量新建落到一级
                setBulkParent(selectedModuleId && !nodeByKey.get(selectedModuleId)?.virtual ? selectedModuleId : null)
            : undefined
        }
        railLabel={(selectedModuleId && nodeByKey.get(selectedModuleId)?.label) || allLabel}
        loading={store.isLoading}
        emptyText={t("requirement_modules.empty")}
      />
      {store.bulkCreateModules && (
        <ModuleBulkCreateModal
          isOpen={bulkParent !== undefined}
          onClose={() => setBulkParent(undefined)}
          nodes={treeNodes}
          defaultParentKey={bulkParent ?? null}
          allowTopLevel={!isRootLocked}
          onSubmit={store.bulkCreateModules}
          onCreated={(parentKey, result) =>
            // 展开上级和新建的模块，让新子树直接可见
            setExpandedKeys((prev) => Array.from(new Set([...prev, ...(parentKey ? [parentKey] : []), ...result.ids])))
          }
        />
      )}
      <AlertModalCore
        isOpen={deleteTarget !== null}
        handleClose={() => setDeleteTarget(null)}
        handleSubmit={() => void handleDeleteConfirm()}
        isSubmitting={isDeleting}
        title={t("requirement_modules.delete_confirm_title")}
        content={
          deleteTarget && getDeleteConfirmContent
            ? getDeleteConfirmContent(deleteTarget)
            : t("requirement_modules.delete_confirm_content", { name: deleteTarget?.label ?? "" })
        }
        // AlertModalCore 的按钮默认是英文硬编码
        primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
};
