import { Ellipsis } from "lucide-react";
import { CustomMenu } from "@plane/ui";

export type THeaderMoreMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  /** false 时不渲染这一项 */
  shouldRender?: boolean;
};

type TProps = {
  items: THeaderMoreMenuItem[];
};

/** 工具栏末尾的「⋯」：分析 / 工作流 / 导入 / 导出这些低频操作收在这里，一项都没有时整个不渲染 */
export const HeaderMoreMenu = ({ items }: TProps) => {
  const visibleItems = items.filter((item) => item.shouldRender !== false);
  if (visibleItems.length === 0) return null;
  return (
    <CustomMenu
      placement="bottom-end"
      closeOnSelect
      customButton={<Ellipsis className="size-4" aria-label="更多操作" />}
      customButtonClassName="grid size-8 shrink-0 place-items-center rounded-md border border-strong bg-layer-2 text-secondary shadow-raised-100 hover:bg-layer-2-hover"
    >
      {visibleItems.map((item) => (
        <CustomMenu.MenuItem key={item.key} onClick={item.onClick}>
          {item.label}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};
