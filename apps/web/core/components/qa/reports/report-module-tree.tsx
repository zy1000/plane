"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "antd";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleTreePanel,
  collectAncestorKeys,
  indexModuleTree,
  isInSubtree,
  type TModuleTreeDropEvent,
  type TModuleTreeEditing,
  type TModuleTreeMenuItem,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
import type { TReportModule } from "@/services/qa/report.service";
import { qaCaseSetToastError } from "@/utils/qa-case-error";

type Props = {
  modules: TReportModule[];
  /** 项目报告总数，显示在「全部报告」上 */
  total: number;
  /** 模块第一次拉取已结束；空树也算加载完 */
  loaded: boolean;
  loading?: boolean;
  selectedModuleId: string | null;
  onSelectModule: (moduleId: string | null) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  createModule: (name: string, parentId: string | null) => Promise<void>;
  renameModule: (moduleId: string, name: string) => Promise<void>;
  moveModule: (moduleId: string, parentId: string | null) => Promise<void>;
  deleteModule: (moduleId: string) => Promise<void>;
};

const toTreeNodes = (list: TReportModule[]): TModuleTreeNode[] =>
  list.map((m) => ({
    key: String(m.id),
    label: String(m.name || "-"),
    count: typeof m.count === "number" ? m.count : undefined,
    children: toTreeNodes(m.children || []),
  }));

/**
 * 测试报告页左侧模块树：包一层共用的 ModuleTreePanel，管展开 / 行内编辑 / 菜单 / 拖拽换父级这些纯 UI 状态，
 * 数据和写接口由 useReportModules 提供。
 */
export const ReportModuleTree = ({
  modules,
  total,
  loaded,
  loading = false,
  selectedModuleId,
  onSelectModule,
  canCreate,
  canEdit,
  canDelete,
  createModule,
  renameModule,
  moveModule,
  deleteModule,
}: Props) => {
  const { t } = useTranslation();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [editing, setEditing] = useState<TModuleTreeEditing>(null);

  const treeNodes = useMemo(() => toTreeNodes(modules), [modules]);
  const nodeIndex = useMemo(() => indexModuleTree(treeNodes), [treeNodes]);

  // 模块第一次加载完（含空树）：选中项（通常来自 URL）不存在就回到「全部报告」，存在就展开它的祖先
  const initialSelectionHandled = useRef(false);
  useEffect(() => {
    if (initialSelectionHandled.current || !loaded) return;
    initialSelectionHandled.current = true;
    if (!selectedModuleId) return;
    const ancestors = collectAncestorKeys(treeNodes, selectedModuleId);
    if (!ancestors) {
      onSelectModule(null);
      return;
    }
    setExpandedKeys((prev) => Array.from(new Set([...prev, ...ancestors])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, modules]);

  const startCreate = (parentKey: string) => {
    if (!canCreate) return;
    setEditing({ kind: "create", parentKey });
    if (parentKey !== MODULE_TREE_ROOT_KEY)
      setExpandedKeys((prev) => (prev.includes(parentKey) ? prev : [...prev, parentKey]));
  };

  const handleEditCommit = async (value: string) => {
    const current = editing;
    setEditing(null);
    const name = value.trim();
    if (!current || !name) return;
    try {
      if (current.kind === "create") {
        if (!canCreate) return;
        await createModule(name, current.parentKey === MODULE_TREE_ROOT_KEY ? null : current.parentKey);
      } else {
        if (!canEdit) return;
        await renameModule(current.key, name);
      }
    } catch (e) {
      qaCaseSetToastError(e, t, current.kind === "create" ? "创建模块失败" : "重命名失败");
    }
  };

  const confirmDelete = (node: TModuleTreeNode) => {
    if (!canDelete) return;
    Modal.confirm({
      title: "删除模块",
      content: `确定删除模块“${node.label}”吗？子模块一起删除，模块下的报告会保留并不再归属任何模块。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          // 删的是当前选中模块或它的子孙时，先回到「全部报告」，否则列表会卡在已不存在的模块上
          if (selectedModuleId && (selectedModuleId === node.key || isInSubtree(node, selectedModuleId)))
            onSelectModule(null);
          await deleteModule(node.key);
        } catch (e) {
          qaCaseSetToastError(e, t, "删除模块失败");
        }
      },
    });
  };

  const getMenuItems = (node: TModuleTreeNode): TModuleTreeMenuItem[] => [
    {
      key: "add",
      label: "添加子模块",
      icon: <FolderPlus className="size-3.5" strokeWidth={1.75} />,
      disabled: !canCreate,
      onClick: () => startCreate(node.key),
    },
    {
      key: "rename",
      label: "重命名",
      icon: <Pencil className="size-3.5" strokeWidth={1.75} />,
      disabled: !canEdit,
      onClick: () => setEditing({ kind: "rename", key: node.key, initialValue: node.label }),
    },
    {
      key: "delete",
      label: "删除",
      icon: <Trash2 className="size-3.5" strokeWidth={1.75} />,
      danger: true,
      disabled: !canDelete,
      onClick: () => confirmDelete(node),
    },
  ];

  // 只支持换父级：拖到节点上成为其子模块，拖到「全部报告」上回到一级
  const handleDrop = async ({ dragKey, targetKey, position }: TModuleTreeDropEvent) => {
    if (!canEdit || position !== "into") return;
    const dragNode = nodeIndex.nodeByKey.get(dragKey);
    if (!dragNode) return;
    if (targetKey !== MODULE_TREE_ROOT_KEY && isInSubtree(dragNode, targetKey)) return;
    const newParent = targetKey === MODULE_TREE_ROOT_KEY ? null : targetKey;
    try {
      await moveModule(dragKey, newParent);
      if (newParent) setExpandedKeys((prev) => (prev.includes(newParent) ? prev : [...prev, newParent]));
    } catch (e) {
      qaCaseSetToastError(e, t, "移动模块失败");
    }
  };

  const selectedLabel = selectedModuleId ? nodeIndex.nodeByKey.get(selectedModuleId)?.label : undefined;

  return (
    <ModuleTreePanel
      root={{ label: "全部报告", count: total }}
      nodes={treeNodes}
      selectedKey={selectedModuleId ?? MODULE_TREE_ROOT_KEY}
      onSelect={(key) => onSelectModule(key === MODULE_TREE_ROOT_KEY ? null : key)}
      expandedKeys={expandedKeys}
      onExpandedKeysChange={setExpandedKeys}
      editing={editing}
      onEditCommit={(value) => void handleEditCommit(value)}
      onEditCancel={() => setEditing(null)}
      getMenuItems={getMenuItems}
      dragMode={canEdit ? "reparent" : "none"}
      onDrop={handleDrop}
      onAddRoot={canCreate ? () => startCreate(MODULE_TREE_ROOT_KEY) : undefined}
      railLabel={selectedLabel || "全部报告"}
      loading={loading}
    />
  );
};
