"use client";

import React, { useEffect, useState } from "react";
import { Modal, Tree, message } from "antd";
import type { TreeProps } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { FolderOpenDot } from "lucide-react";
import { CaseService } from "@/services/qa/case.service";

type Props = {
  isOpen: boolean;
  title: string;
  handleClose: () => void;
  workspaceSlug: string;
  repositoryId: string;
  /** 该模块及其子孙置灰不可选（移动模块时不能选自己下面） */
  disabledSubtreeOf?: string;
  /** 「全部模块」可选，选中时 onConfirm 收到 null（= 根级） */
  allowRoot?: boolean;
  onConfirm: (moduleId: string | null) => Promise<void>;
};

const caseService = new CaseService();

const renderNodeTitle = (title: React.ReactNode, icon: React.ReactNode, bold = false) => (
  <div className="flex w-full items-center gap-2">
    <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">{icon}</span>
    <span className={`text-sm text-primary ${bold ? "font-medium" : ""}`}>{title}</span>
  </div>
);

/** 当前用例库内的「选择模块」弹窗，供移动用例 / 移动模块共用 */
export const ModulePickerModal: React.FC<Props> = ({
  isOpen,
  title,
  handleClose,
  workspaceSlug,
  repositoryId,
  disabledSubtreeOf,
  allowRoot = false,
  onConfirm,
}) => {
  const [modules, setModules] = useState<any[]>([]);
  // undefined = 未选；null = 选了「全部模块」
  const [selectedKey, setSelectedKey] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["all"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen || !workspaceSlug || !repositoryId) return;
    setSelectedKey(undefined);
    caseService
      .getModules(workspaceSlug, repositoryId)
      .then((data) => setModules(data || []))
      .catch((err) => {
        console.error("获取模块失败:", err);
        message.error("获取模块列表失败");
      });
  }, [isOpen, workspaceSlug, repositoryId]);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const onSelect: TreeProps["onSelect"] = (keys, info) => {
    const key = String(info.node.key);
    // 再次点击同一节点（取消选择）时保持当前选中
    if (!info.selected) return;
    if (key === "all") {
      setSelectedKey(allowRoot ? null : undefined);
      return;
    }
    setSelectedKey(String(keys[0]));
  };

  const handleOk = async () => {
    if (selectedKey === undefined) {
      message.warning("请选择目标模块");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(selectedKey);
    } finally {
      setLoading(false);
    }
  };

  const buildTreeNodes = (list: any[], parentDisabled = false): any[] =>
    (list || []).map((node: any) => {
      const nodeId = String(node?.id);
      const disabled = parentDisabled || nodeId === disabledSubtreeOf;
      return {
        title: renderNodeTitle(node?.name ?? "-", <FolderOpenDot size={14} />),
        key: nodeId,
        disabled,
        children: buildTreeNodes(node?.children || [], disabled),
      };
    });

  const treeData = [
    {
      title: renderNodeTitle("全部模块", <AppstoreOutlined />, true),
      key: "all",
      children: buildTreeNodes(modules),
    },
  ];

  const treeSelectedKeys = selectedKey === undefined ? [] : [selectedKey ?? "all"];

  return (
    <Modal
      title={title}
      open={isOpen}
      onCancel={handleClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="确定"
      cancelText="取消"
    >
      <div className="h-[400px] overflow-y-auto rounded border p-2">
        <Tree
          blockNode
          onSelect={onSelect}
          onExpand={onExpand}
          expandedKeys={expandedKeys}
          autoExpandParent={autoExpandParent}
          treeData={treeData}
          selectedKeys={treeSelectedKeys}
          className="custom-tree-indent py-2"
        />
      </div>
    </Modal>
  );
};
