import type { MouseEvent } from "react";
import Link from "next/link";
import { Archive, ArchiveRestoreIcon, CircleCheck, Globe2, Link as LinkIcon, RotateCcw, Settings, Star } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProject } from "@plane/types";
import { cn } from "@plane/utils";

type TActionButtonProps = {
  label: string;
  disabled?: boolean;
  disabledLabel?: string;
  /** 常显底色（关闭 / 重新开启这两个要比其它图标显眼） */
  className?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
};

const ActionButton = ({ label, disabled, disabledLabel, className, onClick, children }: TActionButtonProps) => (
  <Tooltip tooltipContent={<div className="text-xs text-primary">{disabled ? (disabledLabel ?? label) : label}</div>} position="top">
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "grid h-6 w-6 place-items-center rounded text-secondary transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-layer-1-hover hover:text-primary",
        className
      )}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  </Tooltip>
);

type Props = {
  project: TProject;
  /** 状态是已完成 / 已取消 → 显示「重新开启」而不是「关闭」 */
  isClosed: boolean;
  canManageProject: boolean;
  /** 有「项目设置编辑」权限 → 能关闭 / 重新开启 */
  canCloseProject: boolean;
  canPublishProject: boolean;
  settingsPath: string;
  onCopyLink: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void;
  onToggleFavorite: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void;
  onPublish: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void;
  onCloseProject: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void;
  onReopenProject: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void;
  onArchive: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void;
  onRestore: (e: MouseEvent<HTMLButtonElement>, projectId: string) => void;
};

/** 项目列表每行末尾的一排图标按钮：复制链接 / 收藏 / 发布 / 关闭或重新开启 / 归档或恢复 / 设置 */
export const ProjectRowActions = (props: Props) => {
  const {
    project,
    isClosed,
    canManageProject,
    canCloseProject,
    canPublishProject,
    settingsPath,
    onCopyLink,
    onToggleFavorite,
    onPublish,
    onCloseProject,
    onReopenProject,
    onArchive,
    onRestore,
  } = props;
  const isArchived = !!project.archived_at;

  return (
    <div className="flex items-center justify-start gap-2">
      <ActionButton
        label="复制链接"
        disabled={isArchived}
        disabledLabel="已归档不可复制链接"
        onClick={(e) => onCopyLink(e, project.id)}
      >
        <LinkIcon className="h-3 w-3" />
      </ActionButton>
      <ActionButton
        label="收藏"
        disabled={isArchived}
        disabledLabel="已归档不可收藏"
        onClick={(e) => onToggleFavorite(e, project.id)}
      >
        <Star className="h-3 w-3 transition-all" fill={project.is_favorite ? "currentColor" : "none"} />
      </ActionButton>
      <ActionButton
        label="发布项目"
        disabled={isArchived || !canPublishProject}
        disabledLabel={isArchived ? "已归档不可发布" : "无权限发布"}
        onClick={(e) => onPublish(e, project.id)}
      >
        <Globe2 className="h-3 w-3" />
      </ActionButton>
      {isClosed ? (
        <ActionButton
          label="重新开启"
          disabled={isArchived || !canCloseProject}
          disabledLabel={isArchived ? "已归档不可重新开启" : "无权限重新开启"}
          className={!isArchived && canCloseProject ? "bg-success-subtle text-success-primary hover:bg-success-subtle" : undefined}
          onClick={(e) => onReopenProject(e, project.id)}
        >
          <RotateCcw className="h-3 w-3" />
        </ActionButton>
      ) : (
        <ActionButton
          label="关闭项目"
          disabled={isArchived || !canCloseProject}
          disabledLabel={isArchived ? "已归档不可关闭" : "无权限关闭"}
          className={!isArchived && canCloseProject ? "bg-accent-subtle text-accent-primary hover:bg-accent-subtle" : undefined}
          onClick={(e) => onCloseProject(e, project.id)}
        >
          <CircleCheck className="h-3 w-3" />
        </ActionButton>
      )}
      {isArchived ? (
        <ActionButton
          label="恢复项目"
          disabled={!canManageProject}
          disabledLabel="无权限恢复"
          onClick={(e) => onRestore(e, project.id)}
        >
          <ArchiveRestoreIcon className="h-3 w-3" />
        </ActionButton>
      ) : (
        <ActionButton
          label="归档"
          disabled={!canManageProject}
          disabledLabel="无权限归档"
          onClick={(e) => onArchive(e, project.id)}
        >
          <Archive className="h-3 w-3" />
        </ActionButton>
      )}
      <Tooltip tooltipContent={<div className="text-xs text-primary">设置</div>} position="top">
        <Link
          className="flex items-center justify-center rounded p-1 text-placeholder hover:bg-layer-1-hover hover:text-primary"
          onClick={(e) => e.stopPropagation()}
          href={settingsPath}
        >
          <Settings className="h-3.5 w-3.5" />
        </Link>
      </Tooltip>
    </div>
  );
};
