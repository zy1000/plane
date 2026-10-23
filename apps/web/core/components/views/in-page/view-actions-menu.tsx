import type { ReactNode } from "react";
import { Check, Copy, Pencil, Pin, PinOff, SlidersHorizontal, Star, Trash2, User, Users } from "lucide-react";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";

type TViewActionsMenuProps = {
  view: IProjectView;
  ownerName: string;
  isDefault: boolean;
  /** 在页签栏里还是收在「更多」里 */
  isInBar: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  customButton: ReactNode;
  customButtonClassName?: string;
  className?: string;
  ariaLabel?: string;
  placement?: "bottom-start" | "bottom-end";
  onRename: (view: IProjectView) => void;
  onDuplicate: (view: IProjectView) => void;
  onToggleAccess: (view: IProjectView) => void;
  onSetDefault: (viewId: string | null) => void;
  onToggleInBar: (view: IProjectView, inBar: boolean) => void;
  onDelete: (view: IProjectView) => void;
  /** 管理面板里的行菜单不传 */
  onManage?: () => void;
};

export const VIEW_MENU_OPTIONS_CLASS = "w-64 rounded-lg border-subtle px-1.5 py-1.5 shadow-overlay-200";
export const VIEW_MENU_ITEM_CLASS = "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-13 text-primary";
const iconClass = "size-4 shrink-0 text-tertiary";

export const ViewMenuSeparator = () => <div className="mx-1 my-1.5 h-px bg-layer-3" />;

/** 页签菜单与「管理视图」行尾共用的操作菜单 */
export const ViewActionsMenu = (props: TViewActionsMenuProps) => {
  const {
    view,
    ownerName,
    isDefault,
    isInBar,
    canEdit,
    canDelete,
    canCreate,
    customButton,
    customButtonClassName,
    className,
    ariaLabel,
    placement = "bottom-start",
    onRename,
    onDuplicate,
    onToggleAccess,
    onSetDefault,
    onToggleInBar,
    onDelete,
    onManage,
  } = props;
  const isPublic = view.access === EViewAccess.PUBLIC;
  const hasEditGroup = canEdit || canCreate;

  return (
    <CustomMenu
      className={className}
      customButton={customButton}
      customButtonClassName={customButtonClassName}
      ariaLabel={ariaLabel}
      placement={placement}
      optionsClassName={VIEW_MENU_OPTIONS_CLASS}
      maxHeight="lg"
      closeOnSelect
    >
      <div className="flex flex-col gap-1 px-2.5 pt-1.5 pb-2">
        <span className="truncate text-14 font-semibold text-primary">{view.name}</span>
        <span className="flex items-center gap-1.5 text-12 text-tertiary">
          {isPublic ? <Users className="size-3.5 shrink-0" /> : <User className="size-3.5 shrink-0" />}
          <span className="truncate">{isPublic ? `公共视图 · ${ownerName} 创建` : "个人视图 · 只有你能看到"}</span>
        </span>
      </div>
      <ViewMenuSeparator />
      {canEdit && (
        <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={() => onRename(view)}>
          <Pencil className={iconClass} />
          重命名
        </CustomMenu.MenuItem>
      )}
      {canCreate && (
        <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={() => onDuplicate(view)}>
          <Copy className={iconClass} />
          复制为新视图
        </CustomMenu.MenuItem>
      )}
      {canEdit && (
        <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={() => onToggleAccess(view)}>
          {isPublic ? <User className={iconClass} /> : <Users className={iconClass} />}
          {isPublic ? "转为个人视图" : "共享给项目成员"}
        </CustomMenu.MenuItem>
      )}
      {hasEditGroup && <ViewMenuSeparator />}
      <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={() => onSetDefault(isDefault ? null : view.id)}>
        <Star className={cn(iconClass, isDefault && "fill-current text-warning-primary")} />
        <span className="flex-1">{isDefault ? "我的默认视图" : "设为我的默认视图"}</span>
        {isDefault && <Check className="size-4 shrink-0 text-accent-primary" />}
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={() => onToggleInBar(view, !isInBar)}>
        {isInBar ? <PinOff className={iconClass} /> : <Pin className={iconClass} />}
        {isInBar ? "收进「更多」" : "固定到页签栏"}
      </CustomMenu.MenuItem>
      {onManage && (
        <CustomMenu.MenuItem className={VIEW_MENU_ITEM_CLASS} onClick={onManage}>
          <SlidersHorizontal className={iconClass} />
          管理全部视图…
        </CustomMenu.MenuItem>
      )}
      {canDelete && (
        <>
          <ViewMenuSeparator />
          <CustomMenu.MenuItem className={cn(VIEW_MENU_ITEM_CLASS, "text-danger-primary")} onClick={() => onDelete(view)}>
            <Trash2 className="size-4 shrink-0" />
            删除视图
          </CustomMenu.MenuItem>
        </>
      )}
    </CustomMenu>
  );
};
