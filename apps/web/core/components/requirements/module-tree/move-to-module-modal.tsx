"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementModule } from "@plane/types";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleTree,
  collectBranchKeys,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
import type { TRequirementModulesStore } from "@/hooks/store/use-requirement-modules";

const toTreeNodes = (list: TRequirementModule[]): TModuleTreeNode[] =>
  list.map((node) => ({ key: node.id, label: node.name, children: toTreeNodes(node.children ?? []) }));

type TProps = {
  isOpen: boolean;
  handleClose: () => void;
  store: TRequirementModulesStore;
  requirementIds: string[];
  /** 移动成功后由调用方刷新需求列表（树计数由 store 自己刷新） */
  onMoved: () => void;
};

/**
 * 批量「移动到模块」弹窗（仿 QA 用例的 MoveCaseModal）。
 *
 * 与 QA 的差别：根节点「全部需求（不挂模块）」**可选** —— 选它等于取消挂靠
 * （module_id: null）。
 */
export const MoveToModuleModal = (props: TProps) => {
  const { isOpen, handleClose, store, requirementIds, onMoved } = props;
  const { t } = useTranslation();
  /** undefined = 尚未选择；null = 选中「全部（不挂模块）」 */
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const treeNodes = useMemo(() => toTreeNodes(store.modules), [store.modules]);

  // 每次打开清掉上次的选择，并像以前的 defaultExpandAll 一样全部展开
  useEffect(() => {
    if (!isOpen) return;
    setTarget(undefined);
    setExpandedKeys(collectBranchKeys(treeNodes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleOk = async () => {
    if (target === undefined) {
      setToast({
        type: TOAST_TYPE.WARNING,
        title: t("requirement_modules.move_modal_title"),
        message: t("requirement_modules.toast.select_target"),
      });
      return;
    }
    if (!requirementIds.length) return;
    setIsSubmitting(true);
    try {
      await store.moveRequirements(requirementIds, target);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("requirement_modules.move_modal_title"),
        message: t("requirement_modules.toast.move_success", { count: requirementIds.length }),
      });
      onMoved();
      handleClose();
    } catch (error) {
      const payload = error as { error?: string; detail?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? payload?.detail ?? t("requirement_modules.toast.move_failed"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={t("requirement_modules.move_modal_title")}
      open={isOpen}
      onCancel={handleClose}
      onOk={() => void handleOk()}
      confirmLoading={isSubmitting}
      okText={t("confirm")}
      cancelText={t("cancel")}
    >
      <div className="h-[400px] overflow-y-auto rounded-md border border-subtle p-1.5">
        {/* 「全部需求（不挂模块）」可选，等于取消挂靠 */}
        <ModuleTree
          root={{ label: t("requirement_modules.move_none") }}
          nodes={treeNodes}
          selectedKey={target === undefined ? "" : (target ?? MODULE_TREE_ROOT_KEY)}
          onSelect={(key) => setTarget(key === MODULE_TREE_ROOT_KEY ? null : key)}
          expandedKeys={expandedKeys}
          onExpandedKeysChange={setExpandedKeys}
        />
      </div>
    </Modal>
  );
};
