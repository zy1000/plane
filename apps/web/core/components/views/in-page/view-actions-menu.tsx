import type { ReactNode } from "react";
import { Copy, Globe, Pencil, Pin, PinOff, Star, StarOff, Trash2, User } from "lucide-react";
import { EViewAccess } from "@plane/types";
import type { IProjectView } from "@plane/types";
import { CustomMenu } from "@plane/ui";

type TViewActionsMenuProps = {
  view: IProjectView;
  isDefault: boolean;
  /** 在页签栏里还是收在「更多」里 */
  isInBar: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  customButton: ReactNode;
  customButtonClassName?: string;
  placement?: "bottom-start" | "bottom-end";
  onRename: (view: IProjectView) => void;
  onDuplicate: (view: IProjectView) => void;
  onToggleAccess: (view: IProjectView) => void;
  onSetDefault: (viewId: string | null) => void;
  onToggleInBar: (view: IProjectView, inBar: boolean) => void;
  onDelete: (view: IProjectView) => void;
};

const itemClass = "flex items-center gap-2 text-body-xs-medium";
const iconClass = "h-3.5 w-3.5 shrink-0 text-tertiary";

/** 页签 ⋯ 与「管理视图」行尾共用的操作菜单 */
export const ViewActionsMenu = (props: TViewActionsMenuProps) => {
  const {
    view,
    isDefault,
    isInBar,
    canEdit,
    canDelete,
    canCreate,
    customButton,
    customButtonClassName,
    placement = "bottom-start",
    onRename,
    onDuplicate,
    onToggleAccess,
    onSetDefault,
    onToggleInBar,
    onDelete,
  } = props;
  const isPublic = view.access === EViewAccess.PUBLIC;

  return (
    <CustomMenu
      customButton={customButton}
      customButtonClassName={customButtonClassName}
      placement={placement}
      optionsClassName="w-52"
      closeOnSelect
    >
      <div className="mb-1 flex items-center gap-2 border-b border-subtle px-2 pb-2 pt-1">
        {isPublic ? <Globe className={iconClass} /> : <User className={iconClass} />}
        <span className="truncate text-body-xs-medium text-primary">{view.name}</span>
        <span className="ml-auto shrink-0 text-caption-md-regular text-tertiary">{isPublic ? "公共视图" : "个人视图"}</span>
      </div>
      {canEdit && (
        <CustomMenu.MenuItem onClick={() => onRename(view)}>
          <span className={itemClass}>
            <Pencil className={iconClass} />
            重命名
          </span>
        </CustomMenu.MenuItem>
      )}
      {canCreate && (
        <CustomMenu.MenuItem onClick={() => onDuplicate(view)}>
          <span className={itemClass}>
            <Copy className={iconClass} />
            复制为新视图
          </span>
        </CustomMenu.MenuItem>
      )}
      <CustomMenu.MenuItem onClick={() => onSetDefault(isDefault ? null : view.id)}>
        <span className={itemClass}>
          {isDefault ? <StarOff className={iconClass} /> : <Star className={iconClass} />}
          {isDefault ? "取消我的默认视图" : "设为我的默认视图"}
        </span>
      </CustomMenu.MenuItem>
      <CustomMenu.MenuItem onClick={() => onToggleInBar(view, !isInBar)}>
        <span className={itemClass}>
          {isInBar ? <PinOff className={iconClass} /> : <Pin className={iconClass} />}
          {isInBar ? "收进「更多」" : "固定到页签栏"}
        </span>
      </CustomMenu.MenuItem>
      {canEdit && (
        <CustomMenu.MenuItem onClick={() => onToggleAccess(view)}>
          <span className={itemClass}>
            {isPublic ? <User className={iconClass} /> : <Globe className={iconClass} />}
            {isPublic ? "转为个人视图" : "转为公共视图"}
          </span>
        </CustomMenu.MenuItem>
      )}
      {canDelete && (
        <>
          <div className="my-1 border-t border-subtle" />
          <CustomMenu.MenuItem onClick={() => onDelete(view)}>
            <span className={`${itemClass} text-danger-primary`}>
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
              删除视图
            </span>
          </CustomMenu.MenuItem>
        </>
      )}
    </CustomMenu>
  );
};
