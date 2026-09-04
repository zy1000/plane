import type { FC, ReactNode } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Modal } from "antd";
import type { LucideIcon } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  icon: LucideIcon;
  title: string;
  /** 标题右侧的附加操作（如新增公告） */
  headerExtra?: ReactNode;
  exitLabel: string;
  /** 默认盖住页面；公告全屏要低于 ModalCore(z-30) 以免遮住公告详情弹窗 */
  zIndex?: number;
  children: ReactNode;
};

const modalClassName =
  "[&_.ant-modal-close]:!right-5 [&_.ant-modal-close]:!top-4 [&_.ant-modal-close]:inline-flex [&_.ant-modal-close]:!h-auto [&_.ant-modal-close]:!w-auto [&_.ant-modal-close]:items-center [&_.ant-modal-close]:justify-center [&_.ant-modal-close]:rounded-md [&_.ant-modal-close]:px-2 [&_.ant-modal-close]:py-1.5 [&_.ant-modal-close]:transition-colors [&_.ant-modal-close]:hover:!bg-surface-2 [&_.ant-modal-close]:hover:!text-primary [&_.ant-modal-close]:group [&_.ant-modal-close-x]:!h-auto [&_.ant-modal-close-x]:!w-auto";

const contentStyles = {
  height: "100vh" as const,
  maxHeight: "100vh" as const,
  borderRadius: 0,
  boxShadow: "none",
  display: "flex" as const,
  flexDirection: "column" as const,
  padding: 0,
  margin: 0,
};

const headerStyles = {
  flexShrink: 0,
  margin: 0,
  borderRadius: 0,
  padding: "16px 20px",
  minHeight: 64,
  display: "flex" as const,
  alignItems: "center" as const,
};

const bodyStyles = {
  flex: 1,
  minHeight: 0,
  padding: 0,
  overflow: "hidden" as const,
  display: "flex" as const,
  flexDirection: "column" as const,
};

/** 概览页的全屏查看弹窗（项目活动 / 项目公告共用） */
export const OverviewFullscreenModal: FC<Props> = ({
  open,
  onClose,
  icon: Icon,
  title,
  headerExtra,
  exitLabel,
  zIndex,
  children,
}) => (
  <Modal
    title={
      <div className="flex w-full min-w-0 items-center justify-between gap-4 pr-24">
        <div className="flex min-h-11 min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-placeholder" />
          <span className="text-base font-medium text-primary">{title}</span>
        </div>
        {headerExtra}
      </div>
    }
    open={open}
    onCancel={onClose}
    closable
    closeIcon={
      <span className="inline-flex items-center gap-2 text-sm font-normal text-primary transition-colors">
        <CloseOutlined className="text-base text-inherit" />
        <span>{exitLabel}</span>
      </span>
    }
    footer={null}
    centered={false}
    zIndex={zIndex}
    width="100%"
    style={{ top: 0, padding: 0, margin: 0, maxWidth: "100vw" }}
    className={modalClassName}
    classNames={{ wrapper: "!p-0", header: "!mb-0 border-b border-subtle" }}
    styles={{ content: contentStyles, header: headerStyles, body: bodyStyles }}
    destroyOnHidden
    getContainer={() => document.body}
  >
    <div className="flex h-full min-h-0 flex-1 flex-col bg-surface-1">{children}</div>
  </Modal>
);
