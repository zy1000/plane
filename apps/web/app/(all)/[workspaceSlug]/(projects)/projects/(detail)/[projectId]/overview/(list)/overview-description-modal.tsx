"use client";

import { observer } from "mobx-react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import { BookOpen } from "lucide-react";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useWorkspace } from "@/hooks/store/use-workspace";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  initialValue: string | undefined | null;
};

export const OverviewDescriptionModal: React.FC<Props> = observer((props) => {
  const { isOpen, onClose, workspaceSlug, projectId, initialValue } = props;

  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id?.toString() ?? "";

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      title={
        <div className="flex min-h-11 items-center gap-2 pr-2">
          <BookOpen className="h-4 w-4 shrink-0 text-placeholder" />
          <span className="text-base font-medium text-primary">项目背景</span>
        </div>
      }
      open={isOpen}
      onCancel={handleClose}
      closable
      closeIcon={
        <span className="inline-flex items-center gap-2 text-sm font-normal text-primary transition-colors">
          <CloseOutlined className="text-base text-inherit" />
          <span>退出全屏</span>
        </span>
      }
      footer={null}
      centered={false}
      width="100%"
      style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
      className="[&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary [&_.ant-modal-close]:group [&_.ant-modal-close-x]:!h-auto [&_.ant-modal-close-x]:!w-auto"
      classNames={{
        wrapper: "!p-0",
        header: "!mb-0 border-b border-subtle",
      }}
      styles={{
        content: {
          height: "100vh",
          maxHeight: "100vh",
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
      }}
      destroyOnClose
      getContainer={() => document.body}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {workspaceId && (
          <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm p-2">
            <RichTextEditor
              id={`overview-description-readonly-${projectId}`}
              editable={false}
              initialValue={initialValue ?? "<p></p>"}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              projectId={projectId}
              onChange={() => {}}
              placeholder={(isFocused, value) => (value ? "" : "暂无项目背景")}
              containerClassName="h-full"
            />
          </div>
        )}
      </div>
    </Modal>
  );
});
