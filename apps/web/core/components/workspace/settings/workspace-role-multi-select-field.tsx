import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { IWorkspaceRole } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";
import { cn } from "@plane/utils";
import { PERMISSION_GROUP_KIND_LABELS, splitAssignablePermissionGroups } from "./permission-group-kind";
import type { TAssignablePermissionGroupKind } from "./permission-group-kind";

type TWorkspaceRoleOption = {
  value: string;
  data: IWorkspaceRole | { id: string; name: string };
  disabled?: boolean;
  className?: () => string;
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

/** 分组小标题伪选项的 id 前缀：不可选，只用来在列表里隔开两类 */
const KIND_HEADER_PREFIX = "__kind__";
const kindHeaderId = (kind: TAssignablePermissionGroupKind) => `${KIND_HEADER_PREFIX}${kind}`;
const kindFromHeaderId = (id: string) =>
  id.startsWith(KIND_HEADER_PREFIX) ? (id.slice(KIND_HEADER_PREFIX.length) as TAssignablePermissionGroupKind) : null;

/**
 * 权限组多选（受控、无副作用），邀请弹窗和待处理邀请共用。
 * 选项分「工作区权限组 / 数据权限」两组展示，项目权限模板不绑人、不在候选里；
 * 分组标题的 name 为空，搜索时自然被过滤掉，只剩命中的组。
 */
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

  const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);

  const options: TWorkspaceRoleOption[] = useMemo(() => {
    const byKind = splitAssignablePermissionGroups(roles);
    const result: TWorkspaceRoleOption[] = [];
    (["workspace", "data"] as const).forEach((kind) => {
      if (byKind[kind].length === 0) return;
      result.push({
        value: kindHeaderId(kind),
        data: { id: kindHeaderId(kind), name: "" },
        disabled: true,
        className: () => "cursor-default bg-transparent pt-1.5 pb-0.5",
      });
      byKind[kind].forEach((role) => result.push({ value: role.id, data: role }));
    });
    return result;
  }, [roles]);

  const buttonLabel = useMemo(() => {
    if (isLoading) return <span className="text-placeholder">加载中...</span>;
    const selectedNames = value
      .map((roleId) => roleById.get(roleId))
      .filter((role): role is IWorkspaceRole => !!role && role.kind !== "project_template")
      .map((role) => role.name);
    if (selectedNames.length === 0) return <span className="text-placeholder">选择权限组</span>;
    if (selectedNames.length === 1) return <span className="truncate">{selectedNames[0]}</span>;
    return (
      <span className="truncate">
        {selectedNames[0]} +{selectedNames.length - 1}
      </span>
    );
  }, [roleById, isLoading, value]);

  return (
    <MultiSelectDropdown
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled || isLoading}
      disableSorting
      keyExtractor={(option) => option.data.id}
      queryArray={["name"]}
      inputPlaceholder="搜索权限组..."
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
        const headerKind = kindFromHeaderId(roleId);
        if (headerKind) {
          return <span className="text-11 font-medium text-tertiary">{PERMISSION_GROUP_KIND_LABELS[headerKind]}</span>;
        }
        const role = roleById.get(roleId);
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
