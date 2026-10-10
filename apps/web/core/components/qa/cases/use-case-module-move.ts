"use client";

import { useCallback } from "react";
import { useTranslation } from "@plane/i18n";
import { CaseModuleService } from "@/services/qa";
import { qaCaseSetToastError } from "@/utils/qa-case-error";
import { MODULE_TREE_ROOT_KEY, type TModuleTreeDropEvent } from "@/components/qa/module-tree";
import { findModuleById, findModuleParentId, isModuleInSubtree } from "./case-tree-utils";

const caseModuleService = new CaseModuleService();

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
  /** 移动成功后回调，newParentId 为 null 表示移到根级 */
  onMoved: (newParentId: string | null) => void | Promise<void>;
};

/**
 * 用例模块树的库内移动：把 ModuleTree 的拖拽落点换算成后端 move 接口的参数，
 * 同时暴露 moveModule 供「移动到」弹窗使用。排序由后端按锚点重排同级序号。
 */
export const useCaseModuleMove = ({ workspaceSlug, modules, canEdit, onMoved }: Params) => {
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

  const onDrop = useCallback(
    ({ dragKey, targetKey, position }: TModuleTreeDropEvent) => {
      if (!canEdit) return;
      const dragModule = findModuleById(modules, dragKey);
      if (!dragModule) return;

      // 落在节点上：成为它的子模块（追加到末尾）；落在「全部用例」上 = 移到根级
      if (position === "into") {
        const targetParentId = targetKey === MODULE_TREE_ROOT_KEY ? null : targetKey;
        if (targetParentId && isModuleInSubtree(dragModule, targetParentId)) return;
        void submitMove({ module_id: dragKey, target_parent_id: targetParentId });
        return;
      }

      // 落在节点前 / 后：与它同级，排在它前 / 后
      if (targetKey === MODULE_TREE_ROOT_KEY || isModuleInSubtree(dragModule, targetKey)) return;
      const parentId = findModuleParentId(modules, targetKey);
      if (parentId === undefined) return;
      void submitMove({ module_id: dragKey, target_parent_id: parentId, anchor_id: targetKey, placement: position });
    },
    [canEdit, modules, submitMove]
  );

  return { onDrop, moveModule };
};
