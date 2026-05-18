import { Modal } from "antd";

export const confirmDeleteFiles = (count: number, onConfirm: () => void) => {
  Modal.confirm({
    title: count > 1 ? `确认删除这 ${count} 个文件？` : "确认删除该文件？",
    content: "删除后将无法恢复。",
    okText: "删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: onConfirm,
  });
};

export const confirmDeleteFolder = (folderName: string, onConfirm: () => void) => {
  Modal.confirm({
    title: "确认删除该文件夹？",
    content: `将级联删除「${folderName}」及其所有子目录和文件，操作不可恢复。`,
    okText: "删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: onConfirm,
  });
};
