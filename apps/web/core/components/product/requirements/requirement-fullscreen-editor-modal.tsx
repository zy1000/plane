"use client";

import { Modal } from "antd";
import { FileText, ListChecks, Minimize2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EFileAssetType } from "@plane/types";
import { ProductDescriptionEditor } from "@/components/product/product-description-editor";

export type TRequirementEditorKind = "description" | "acceptance-criteria";

type Props = {
  isOpen: boolean;
  kind: TRequirementEditorKind;
  workspaceSlug: string;
  productId: string;
  requirementId?: string;
  value?: string | null;
  onChange: (value: string) => void;
  onAssetUpload: (assetId: string) => void;
  onClose: () => void;
};

const EDITOR_META = {
  description: {
    title: "编辑需求描述",
    helper: "补充用户场景、问题与期望结果",
    placeholder: "描述用户场景、问题与期望结果",
    editorId: "requirement-description-fullscreen",
    Icon: FileText,
  },
  "acceptance-criteria": {
    title: "编辑验收标准",
    helper: "列出清晰、可验证的完成条件",
    placeholder: "列出可验证的完成条件",
    editorId: "requirement-acceptance-fullscreen",
    Icon: ListChecks,
  },
} as const;

export function RequirementFullscreenEditorModal(props: Props) {
  const { isOpen, kind, onAssetUpload, onChange, onClose, productId, requirementId, value, workspaceSlug } = props;
  const { editorId, helper, Icon, placeholder, title } = EDITOR_META[kind];

  return (
    <Modal
      title={
        <div className="flex min-h-11 min-w-0 items-center gap-2 pr-32">
          <Icon className="size-4 shrink-0 text-tertiary" />
          <span className="shrink-0 text-16 font-medium text-primary">{title}</span>
          <span className="hidden truncate text-13 font-normal text-tertiary sm:inline">{helper}</span>
        </div>
      }
      open={isOpen}
      onCancel={onClose}
      closable
      closeIcon={
        <span className="inline-flex items-center gap-1.5 text-13 font-normal text-primary">
          <Minimize2 className="size-4" />
          <span>退出全屏</span>
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-4 px-1 py-1">
          <p className="hidden text-12 text-tertiary sm:block">编辑内容会同步到当前需求</p>
          <Button type="button" variant="primary" size="lg" className="ml-auto" onClick={onClose}>
            完成编辑
          </Button>
        </div>
      }
      centered={false}
      width="100%"
      style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
      className="[&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary [&_.ant-modal-close-x]:!h-auto [&_.ant-modal-close-x]:!w-auto"
      classNames={{
        wrapper: "!p-0",
        header: "!mb-0 border-b border-subtle",
        footer: "!mt-0 border-t border-subtle bg-surface-1",
      }}
      styles={{
        content: {
          height: "100dvh",
          maxHeight: "100dvh",
          borderRadius: 0,
          boxShadow: "none",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          margin: 0,
        },
        header: {
          flexShrink: 0,
          margin: 0,
          borderRadius: 0,
          padding: "16px 20px",
          minHeight: 64,
          display: "flex",
          alignItems: "center",
        },
        body: {
          flex: 1,
          minHeight: 0,
          padding: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        },
        footer: { flexShrink: 0, margin: 0, padding: "12px 20px" },
      }}
      destroyOnClose
      getContainer={() => document.body}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-1 p-4">
        <div className="min-h-0 flex-1">
          <ProductDescriptionEditor
            workspaceSlug={workspaceSlug}
            productId={productId}
            entityIdentifier={requirementId}
            assetEntityType={EFileAssetType.REQUIREMENT_ATTACHMENT}
            editorId={editorId}
            value={value}
            editable
            placeholder={placeholder}
            minHeightClassName="min-h-full"
            heightClassName="h-full max-h-none"
            onChange={onChange}
            onAssetUpload={onAssetUpload}
          />
        </div>
      </div>
    </Modal>
  );
}
