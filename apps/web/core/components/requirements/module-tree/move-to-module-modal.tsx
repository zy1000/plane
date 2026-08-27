"use client";

import { useEffect, useState } from "react";
import { Modal, Tree } from "antd";
import type { TreeProps } from "antd";
import { FolderOpenDot, Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirementModule } from "@plane/types";
import type { TRequirementModulesStore } from "@/hooks/store/use-requirement-modules";

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

  useEffect(() => {
    if (isOpen) setTarget(undefined);
  }, [isOpen]);

  const handleSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    if (!info.selected) return;
    const key = selectedKeys[0] as string | undefined;
    if (!key) return;
    setTarget(key === "all" ? null : key);
  };

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

  const buildTreeNodes = (list: TRequirementModule[]): NonNullable<TreeProps["treeData"]> =>
    list.map((node) => ({
      title: (
        <div className="flex w-full items-center gap-2">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-secondary">
            <FolderOpenDot size={14} />
          </span>
          <span className="truncate text-sm text-primary">{node.name}</span>
        </div>
      ),
      key: node.id,
      children: buildTreeNodes(node.children ?? []),
    }));

  const treeData: TreeProps["treeData"] = [
    {
      title: (
        <div className="flex w-full items-center gap-2">
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-secondary">
            <Layers size={14} />
          </span>
          <span className="truncate text-sm font-medium text-primary">{t("requirement_modules.move_none")}</span>
        </div>
      ),
      key: "all",
      children: buildTreeNodes(store.modules),
    },
  ];

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
      <div className="h-[400px] overflow-y-auto rounded border border-subtle p-2">
        <Tree
          blockNode
          defaultExpandAll
          onSelect={handleSelect}
          treeData={treeData}
          selectedKeys={target === undefined ? [] : target === null ? ["all"] : [target]}
          className="py-2"
        />
      </div>
    </Modal>
  );
};
