import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { IWorkspaceRole } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";
import { cn } from "@plane/utils";

type TWorkspaceRoleOption = {
  value: string;
  data: IWorkspaceRole;
};

type Props = {
  roles: IWorkspaceRole[];
  isLoading: boolean;
  value: string[];
  onChange: (roleIds: string[]) => void;
  disabled?: boolean;
  hasError?: boolean;
  /** 触发按钮内层样式，默认为成员表格里的无边框样式 */
  buttonClassName?: string;
  buttonContainerClassName?: string;
  containerClassName?: string;
  optionsContainerClassName?: string;
};

/** 工作区自定义角色多选（受控、无副作用），系统角色不在候选中 */
export function WorkspaceRoleMultiSelectField(props: Props) {
  const {
    roles,
    isLoading,
    value,
    onChange,
    disabled = false,
    hasError = false,
    buttonClassName,
    buttonContainerClassName,
    containerClassName = "w-40 rounded-md p-0",
    optionsContainerClassName = "w-52",
  } = props;

  const customRoles = useMemo(() => roles.filter((role) => !role.is_system), [roles]);
  const options: TWorkspaceRoleOption[] = useMemo(
    () => customRoles.map((role) => ({ value: role.id, data: role })),
    [customRoles]
  );

  const buttonLabel = useMemo(() => {
    if (isLoading) return <span className="text-placeholder">加载中...</span>;
    const selectedNames = customRoles.filter((role) => value.includes(role.id)).map((role) => role.name);
    if (selectedNames.length === 0) return <span className="text-placeholder">选择角色</span>;
    if (selectedNames.length === 1) return <span className="truncate">{selectedNames[0]}</span>;
    return (
      <span className="truncate">
        {selectedNames[0]} +{selectedNames.length - 1}
      </span>
    );
  }, [customRoles, isLoading, value]);

  return (
    <MultiSelectDropdown
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled || isLoading}
      disableSorting
      keyExtractor={(option) => option.data.id}
      queryArray={["name"]}
      inputPlaceholder="搜索角色..."
      buttonContent={() => (
        <div
          className={cn(
            "flex w-full cursor-pointer items-center justify-between gap-1 text-13",
            { "border-danger-strong": hasError },
            buttonClassName
          )}
        >
          {buttonLabel}
          <ChevronDown className="size-3 shrink-0 text-secondary" />
        </div>
      )}
      buttonContainerClassName={buttonContainerClassName}
      containerClassName={containerClassName}
      optionsContainerClassName={optionsContainerClassName}
      renderItem={({ value: roleId, selected }) => {
        const role = customRoles.find((item) => item.id === roleId);
        if (!role) return null;
        return (
          <div className="flex w-full items-center justify-between gap-2 truncate text-13">
            <span className="truncate">{role.name}</span>
            {selected && <Check className="size-3 shrink-0" />}
          </div>
        );
      }}
    />
  );
}
