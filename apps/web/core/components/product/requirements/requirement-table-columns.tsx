import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  ClipboardList,
  CircleDot,
  GitBranch,
  LayoutGrid,
  Pencil,
  SignalHigh,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { PriorityIcon } from "@plane/propel/icons";
import { Avatar, CustomMenu } from "@plane/ui";
import { getFileURL, renderFormattedDate } from "@plane/utils";
import type { TUserRequirementListItem } from "@/services/requirement.service";

const priorityLabels: Record<string, string> = {
  urgent: "紧急",
  high: "高",
  medium: "中",
  low: "低",
  none: "无",
};

type TRequirementTableColumnsParams = {
  onOpen: (requirement: TUserRequirementListItem) => void;
  onEdit: (requirement: TUserRequirementListItem) => void;
  onDelete: (requirement: TUserRequirementListItem) => void;
};

function HeaderLabel(props: { icon: LucideIcon; label: string }) {
  const { icon: Icon, label } = props;
  return (
    <div className="flex w-full items-center gap-1.5 text-13 font-medium text-secondary">
      <Icon className="size-4 shrink-0 text-placeholder" />
      <span className="truncate">{label}</span>
    </div>
  );
}

export function getRequirementTableColumns(params: TRequirementTableColumnsParams) {
  const { onDelete, onEdit, onOpen } = params;

  return [
    {
      key: "name",
      content: "需求名称",
      thClassName: "sticky left-0 z-[15] w-[420px] min-w-[320px] max-w-[520px]",
      tdClassName: "sticky left-0 z-10 w-[420px] min-w-[320px] max-w-[520px] bg-surface-1 group-hover:bg-layer-1/60",
      thRender: () => <HeaderLabel icon={ClipboardList} label="需求名称" />,
      tdRender: (requirement: TUserRequirementListItem) => (
        <button
          type="button"
          className="flex h-11 w-full min-w-0 items-center gap-2 px-3 text-left hover:text-primary"
          onClick={() => onOpen(requirement)}
        >
          <ClipboardList className="size-3.5 shrink-0 text-accent-primary" />
          <span className="min-w-0 truncate text-13 text-primary">{requirement.name}</span>
          <span className="ml-auto shrink-0 text-11 text-tertiary">
            {requirement.attachment_count} 附件 · {requirement.sub_requirements_count} 子需求
          </span>
        </button>
      ),
    },
    {
      key: "status",
      content: "状态",
      thClassName: "w-28 min-w-28 max-w-28",
      tdClassName: "w-28 min-w-28 max-w-28",
      thRender: () => <HeaderLabel icon={CircleDot} label="状态" />,
      tdRender: (requirement: TUserRequirementListItem) => {
        const meta = {
          in_review: { label: "评审中", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300" },
          active: { label: "激活", className: "bg-green-500/10 text-green-700 dark:text-green-300" },
          rejected: { label: "拒绝", className: "bg-red-500/10 text-red-700 dark:text-red-300" },
        }[requirement.status];
        return (
          <div className="flex h-11 items-center px-3">
            <span className={`rounded-full px-2 py-0.5 text-11 font-medium ${meta.className}`}>{meta.label}</span>
          </div>
        );
      },
    },
    {
      key: "module",
      content: "模块",
      thClassName: "w-36 min-w-36 max-w-36",
      tdClassName: "w-36 min-w-36 max-w-36",
      thRender: () => <HeaderLabel icon={LayoutGrid} label="模块" />,
      tdRender: (requirement: TUserRequirementListItem) => (
        <div className="flex h-11 items-center truncate px-3 text-13 text-secondary">
          {requirement.module_detail?.name ?? "—"}
        </div>
      ),
    },
    {
      key: "priority",
      content: "优先级",
      thClassName: "w-36 min-w-36 max-w-36",
      tdClassName: "w-36 min-w-36 max-w-36",
      thRender: () => <HeaderLabel icon={SignalHigh} label="优先级" />,
      tdRender: (requirement: TUserRequirementListItem) => (
        <div className="flex h-11 items-center gap-1.5 px-3 text-13 text-secondary">
          <PriorityIcon priority={requirement.priority} size={13} withContainer />
          {priorityLabels[requirement.priority]}
        </div>
      ),
    },
    {
      key: "assignee",
      content: "负责人",
      thClassName: "w-36 min-w-36 max-w-36",
      tdClassName: "w-36 min-w-36 max-w-36",
      thRender: () => <HeaderLabel icon={UserRound} label="负责人" />,
      tdRender: (requirement: TUserRequirementListItem) =>
        requirement.assignee_detail ? (
          <div className="flex h-11 min-w-0 items-center gap-2 px-3">
            <Avatar
              name={requirement.assignee_detail.display_name}
              src={getFileURL(requirement.assignee_detail.avatar_url)}
              size="sm"
              showTooltip={false}
            />
            <span className="truncate text-13 text-secondary">{requirement.assignee_detail.display_name}</span>
          </div>
        ) : (
          <div className="flex h-11 items-center px-3 text-13 text-placeholder">未分配</div>
        ),
    },
    {
      key: "reviewers",
      content: "评审人",
      thClassName: "w-40 min-w-40 max-w-40",
      tdClassName: "w-40 min-w-40 max-w-40",
      thRender: () => <HeaderLabel icon={Users} label="评审人" />,
      tdRender: (requirement: TUserRequirementListItem) => {
        const names = requirement.reviewer_details.map((reviewer) => reviewer.display_name).join("、");
        return (
          <div className="flex h-11 items-center truncate px-3 text-13 text-secondary" title={names}>
            {requirement.reviewer_details.length > 0 ? names : "—"}
          </div>
        );
      },
    },
    {
      key: "parent",
      content: "父需求",
      thClassName: "w-40 min-w-40 max-w-40",
      tdClassName: "w-40 min-w-40 max-w-40",
      thRender: () => <HeaderLabel icon={GitBranch} label="父需求" />,
      tdRender: (requirement: TUserRequirementListItem) => (
        <div className="flex h-11 items-center truncate px-3 text-13 text-secondary">
          {requirement.parent_detail?.name ?? "—"}
        </div>
      ),
    },
    {
      key: "updated_at",
      content: "更新时间",
      thClassName: "w-36 min-w-36 max-w-36",
      tdClassName: "w-36 min-w-36 max-w-36",
      thRender: () => <HeaderLabel icon={CalendarClock} label="更新时间" />,
      tdRender: (requirement: TUserRequirementListItem) => (
        <div className="flex h-11 items-center px-3 text-13 text-tertiary">
          {renderFormattedDate(requirement.updated_at)}
        </div>
      ),
    },
    {
      key: "actions",
      content: "",
      thClassName: "w-12 min-w-12 max-w-12",
      tdClassName: "w-12 min-w-12 max-w-12",
      thRender: () => null,
      tdRender: (requirement: TUserRequirementListItem) => (
        <div className="flex h-11 items-center justify-center">
          <CustomMenu ellipsis placement="bottom-end" closeOnSelect>
            <CustomMenu.MenuItem onClick={() => onEdit(requirement)}>
              <span className="flex items-center gap-2">
                <Pencil className="size-3.5" />
                发起变更
              </span>
            </CustomMenu.MenuItem>
            <CustomMenu.MenuItem onClick={() => onDelete(requirement)}>
              <span className="flex items-center gap-2 text-danger-primary">
                <Trash2 className="size-3.5" />
                删除
              </span>
            </CustomMenu.MenuItem>
          </CustomMenu>
        </div>
      ),
    },
  ];
}
