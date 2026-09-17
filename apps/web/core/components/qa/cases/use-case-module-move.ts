"use client";

import { useCallback } from "react";
import type { TreeProps } from "antd";
import { useTranslation } from "@plane/i18n";
import { CaseModuleService } from "@/services/qa";
import { qaCaseSetToastError } from "@/utils/qa-case-error";
import { findModuleById, findModuleParentId, isModuleInSubtree } from "./case-tree-utils";

const caseModuleService = new CaseModuleService();

const ROOT_KEY = "all";
const isCreatingKey = (key: string) => key.startsWith("__creating__");

type TMovePayload = {
  module_id: string;
  target_parent_id: string | null;
  anchor_id?: string;
  placement?: "before" | "after";
};

type Params = {
  workspaceSlug: string | undefined;
  /** 完整模块树（未经搜索过滤），用于找父级 / 子孙 */
  modules: any[];
  canEdit: boolean;
  /** 正在重命名的节点不可拖，避免拖动输入框 */
  renamingModuleId?: string | null;
  /** 移动成功后回调，newParentId 为 null 表示移到根级 */
  onMoved: (newParentId: string | null) => void | Promise<void>;
};

/**
 * 用例模块树的库内移动：给 antd Tree 提供 draggable / allowDrop / onDrop，
 * 同时暴露 moveModule 供「移动到」弹窗使用。排序由后端按锚点重排同级序号。
 */
export const useCaseModuleMove = ({ workspaceSlug, modules, canEdit, renamingModuleId, onMoved }: Params) => {
  const { t } = useTranslation();

  const submitMove = useCallback(
    async (payload: TMovePayload) => {
      if (!workspaceSlug) return false;
      try {
        await caseModuleService.moveModule(workspaceSlug, payload);
        await onMoved(payload.target_parent_id);
        return true;
      } catch (e) {
        qaCaseSetToastError(e, t, "移动失败");
        return false;
      }
    },
    [workspaceSlug, onMoved, t]
  );

  /** 移到目标模块下（null = 根级），追加到末尾 */
  const moveModule = useCallback(
    (moduleId: string, targetParentId: string | null) =>
      submitMove({ module_id: moduleId, target_parent_id: targetParentId }),
    [submitMove]
  );

  const draggable: TreeProps["draggable"] = canEdit
    ? {
        icon: false,
        nodeDraggable: (node) => {
          const key = String(node.key);
          return key !== ROOT_KEY && !isCreatingKey(key) && key !== renamingModuleId;
        },
      }
    : false;

  const allowDrop: TreeProps["allowDrop"] = ({ dragNode, dropNode, dropPosition }) => {
    const dragKey = String(dragNode.key);
    const dropKey = String(dropNode.key);
    if (isCreatingKey(dropKey)) return false;
    // 「全部用例」只能作为落点（= 移到根级），不能排到它的前后
    if (dropKey === ROOT_KEY) return dropPosition === 0;
    return !isModuleInSubtree(findModuleById(modules, dragKey), dropKey);
  };

  const onDrop: TreeProps["onDrop"] = (info) => {
    if (!canEdit) return;
    const dragKey = String(info.dragNode.key);
    const dropKey = String(info.node.key);
    if (dragKey === dropKey || isCreatingKey(dropKey)) return;

    const dragModule = findModuleById(modules, dragKey);
    if (!dragModule) return;

    // 落在节点上：成为它的子模块（追加到末尾）
    if (!info.dropToGap) {
      const targetParentId = dropKey === ROOT_KEY ? null : dropKey;
      if (targetParentId && isModuleInSubtree(dragModule, targetParentId)) return;
      void submitMove({ module_id: dragKey, target_parent_id: targetParentId });
      return;
    }

    if (dropKey === ROOT_KEY) return;
    const dropPos = String(info.node.pos).split("-");
    const relative = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    // 落在「已展开且有子模块」的节点下沿：antd 的指示线表示插到它的第一个子模块前
    const dropModule = findModuleById(modules, dropKey);
    const dropChildren: any[] = dropModule?.children || [];
    if (relative === 1 && info.node.expanded && dropChildren.length > 0) {
      const firstChildId = String(dropChildren[0].id);
      if (firstChildId === dragKey) return;
      void submitMove({ module_id: dragKey, target_parent_id: dropKey, anchor_id: firstChildId, placement: "before" });
      return;
    }

    // 落在节点前/后间隙：与它同级，排在它前/后
    const parentId = findModuleParentId(modules, dropKey);
    if (parentId === undefined) return;
    void submitMove({
      module_id: dragKey,
      target_parent_id: parentId,
      anchor_id: dropKey,
      placement: relative === -1 ? "before" : "after",
    });
  };

  return { draggable, allowDrop, onDrop, moveModule };
};
