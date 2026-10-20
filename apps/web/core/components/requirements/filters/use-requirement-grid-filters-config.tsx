import { useMemo } from "react";
import {
  AlignLeft,
  FileImage,
  Folder,
  ListChecks,
  Paperclip,
  ToggleLeft,
  Type,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { MembersPropertyIcon } from "@plane/propel/icons";
import type {
  IUserLite,
  TFilterConfig,
  TRequirementField,
  TRequirementFieldType,
  TRequirementModule,
  TSupportedOperators,
} from "@plane/types";
import {
  COLLECTION_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getFileURL,
  getMultiSelectConfig,
  getSingleSelectConfig,
  getTextInputConfig,
} from "@plane/utils";
import { UNASSIGNED_MODULE_KEY, UnassignedModuleIcon } from "@/components/qa/module-tree";
import {
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
  resolveBuiltinColumns,
  type TResolvedBuiltinEntry,
} from "@/components/requirements/requirement-builtin-layout";
import { getRequirementSelectMode, getRequirementSelectOptions } from "@/components/requirements/requirement-select";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import {
  REQUIREMENT_EMPTY_FILTER_VALUE,
  REQUIREMENT_MODULE_FILTER_FIELD,
  REQUIREMENT_NOT_EMPTY_FILTER_VALUE,
} from "./expression-to-requirement-filters";
import type { TRequirementGridFilterProperty } from "./types";

type TSelectOption = {
  id: string;
  label: string;
  value: string;
};

type TOperatorParams = {
  isEnabled: boolean;
  allowedOperators: Set<TSupportedOperators>;
  allowNegative: boolean;
};

const CUSTOM_FIELD_ICONS: Record<TRequirementFieldType, LucideIcon> = {
  text: Type,
  rich_text: AlignLeft,
  select: ListChecks,
  member: UserRound,
  boolean: ToggleLeft,
  attachment: Paperclip,
  image: FileImage,
  form: ListChecks,
};

/** 表单本身不能筛，只收启用中的叶子字段（含子表单 child） */
export const collectRequirementGridFilterFields = (fields: TRequirementField[]): TRequirementField[] =>
  fields.flatMap((field) => {
    if (!field.is_active) return [];
    if (field.field_type === "form") return field.children.filter((child) => child.is_active);
    return [field];
  });

const getTextOperatorConfigs = (params: TOperatorParams, placeholder: string, emptyOptions: TSelectOption[]) =>
  new Map([
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.CONTAINS, params, (updatedParams) =>
      getTextInputConfig({
        ...updatedParams,
        placeholder,
      })
    ),
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) =>
      getSingleSelectConfig<TSelectOption, string, undefined>(
        {
          items: emptyOptions,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
        },
        { isOperatorEnabled: updatedParams.isOperatorEnabled }
      )
    ),
  ]);

const getExactSelectOperatorConfigs = (options: TSelectOption[], params: TOperatorParams) =>
  new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) =>
      getSingleSelectConfig<TSelectOption, string, undefined>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
        },
        { isOperatorEnabled: updatedParams.isOperatorEnabled }
      )
    ),
  ]);

const getContainsSelectOperatorConfigs = (options: TSelectOption[], params: TOperatorParams) =>
  new Map([
    createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.CONTAINS, params, (updatedParams) =>
      getSingleSelectConfig<TSelectOption, string, undefined>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
        },
        { isOperatorEnabled: updatedParams.isOperatorEnabled }
      )
    ),
  ]);

/** 模块树按树序拍平；子模块用「父 / 子」路径作名称，选项里能看出层级、搜子模块名也能命中 */
const flattenModuleOptions = (modules: TRequirementModule[], parentPath = ""): TSelectOption[] =>
  modules.flatMap((module) => {
    const path = parentPath ? `${parentPath} / ${module.name}` : module.name;
    return [{ id: module.id, label: path, value: module.id }, ...flattenModuleOptions(module.children ?? [], path)];
  });

/** 模块筛选多选：选父模块含子模块、「未归类」= 未挂靠，二者取或，均由后端解析。不提供取反（后端只认正向） */
const getModuleOperatorConfigs = (options: TSelectOption[], params: TOperatorParams) =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, { ...params, allowNegative: false }, (updatedParams) =>
      getMultiSelectConfig<TSelectOption, string, string>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
          getIconData: (option) => option.id,
        },
        {
          singleValueOperator: EQUALITY_OPERATOR.EXACT,
          isOperatorEnabled: updatedParams.isOperatorEnabled,
        },
        {
          getOptionIcon: (optionId) =>
            optionId === UNASSIGNED_MODULE_KEY ? (
              <UnassignedModuleIcon className="size-3.5 text-tertiary" />
            ) : (
              <Folder className="size-3.5 text-tertiary" />
            ),
        }
      )
    ),
  ]);

const getEmptyOperatorConfigs = (options: TSelectOption[], params: TOperatorParams) =>
  new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) =>
      getSingleSelectConfig<TSelectOption, string, undefined>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
        },
        { isOperatorEnabled: updatedParams.isOperatorEnabled }
      )
    ),
  ]);

export const useRequirementGridFiltersConfig = ({
  workspaceSlug,
  entityKind,
  builtinColumns,
  customFields,
  modules,
}: {
  workspaceSlug: string;
  entityKind: "product" | "library";
  /** 已按类型布局解析并按 entityKind 过滤的内置属性列（不含 title）。缺省回退现状顺序 */
  builtinColumns?: TResolvedBuiltinEntry[];
  customFields: TRequirementField[];
  /** 库 / 产品的模块树：传了才提供「模块」筛选（首项「未归类」）；基线快照等不走后端模块过滤的场景不传 */
  modules?: TRequirementModule[];
}) => {
  const { t } = useTranslation();
  const {
    getUserDetails,
    workspace: { workspaceMemberIds },
  } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const members = useMemo(
    () =>
      (workspaceMemberIds ?? [])
        .map((memberId) => getUserDetails(memberId))
        .filter((member): member is IUserLite => Boolean(member)),
    [getUserDetails, workspaceMemberIds]
  );

  const emptyOptions = useMemo<TSelectOption[]>(
    () => [
      {
        id: REQUIREMENT_EMPTY_FILTER_VALUE,
        value: REQUIREMENT_EMPTY_FILTER_VALUE,
        label: t("requirement_grid.filters.is_empty"),
      },
      {
        id: REQUIREMENT_NOT_EMPTY_FILTER_VALUE,
        value: REQUIREMENT_NOT_EMPTY_FILTER_VALUE,
        label: t("requirement_grid.filters.is_not_empty"),
      },
    ],
    [t]
  );

  const statusOptions = useMemo<TSelectOption[]>(
    () =>
      REQUIREMENT_STATUSES.map((status) => ({
        id: status,
        value: status,
        label: t(`requirement_fields.statuses.${status}`),
      })),
    [t]
  );

  const priorityOptions = useMemo<TSelectOption[]>(
    () =>
      REQUIREMENT_PRIORITIES.map((priority) => ({
        id: priority,
        value: priority,
        label: t(priority),
      })),
    [t]
  );

  const booleanOptions = useMemo(
    () => [
      { id: "true", label: t("requirement_grid.data.yes"), value: true },
      { id: "false", label: t("requirement_grid.data.no"), value: false },
    ],
    [t]
  );

  const moduleOptions = useMemo<TSelectOption[] | null>(
    () =>
      modules
        ? [
            { id: UNASSIGNED_MODULE_KEY, label: t("requirement_modules.unassigned"), value: UNASSIGNED_MODULE_KEY },
            ...flattenModuleOptions(modules),
          ]
        : null,
    [modules, t]
  );

  const searchPlaceholder = t("search");
  const operatorParams: TOperatorParams = {
    isEnabled: true,
    allowedOperators: operatorConfigs.allowedOperators,
    allowNegative: operatorConfigs.allowNegative,
  };

  const configs = useMemo(() => {
    const nextConfigs: TFilterConfig<TRequirementGridFilterProperty>[] = [];
    // 标题恒在最前，其余内置列按类型布局顺序（与网格列序一致）
    const orderedBuiltinColumns = [
      REQUIREMENT_BUILTIN_TITLE_COLUMN,
      ...(builtinColumns ?? resolveBuiltinColumns(entityKind, null)).map((entry) => entry.column),
    ];

    for (const column of orderedBuiltinColumns) {
      const icon = column.icon;
      const label = t(column.labelKey);

      if (column.key === "status") {
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: column.key,
            label,
            icon,
            isEnabled: true,
            supportedOperatorConfigsMap: getExactSelectOperatorConfigs(statusOptions, operatorParams),
          })
        );
        continue;
      }

      if (column.key === "priority") {
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: column.key,
            label,
            icon,
            isEnabled: true,
            supportedOperatorConfigsMap: getExactSelectOperatorConfigs(priorityOptions, operatorParams),
          })
        );
        continue;
      }

      if (column.key === "assignee_id") {
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: column.key,
            label,
            icon: MembersPropertyIcon,
            isEnabled: members.length > 0,
            supportedOperatorConfigsMap: new Map([
              createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, operatorParams, (updatedParams) =>
                getSingleSelectConfig<IUserLite, string, IUserLite>(
                  {
                    items: members,
                    getId: (member) => member.id,
                    getLabel: (member) => member.display_name,
                    getValue: (member) => member.id,
                    getIconData: (member) => member,
                  },
                  { isOperatorEnabled: updatedParams.isOperatorEnabled },
                  {
                    getOptionIcon: (memberDetails) =>
                      memberDetails ? (
                        <Avatar
                          name={memberDetails.display_name}
                          src={getFileURL(memberDetails.avatar_url)}
                          showTooltip={false}
                          size="sm"
                        />
                      ) : null,
                  }
                )
              ),
            ]),
          })
        );
        continue;
      }

      nextConfigs.push(
        createFilterConfig<TRequirementGridFilterProperty>({
          id: column.key,
          label,
          icon,
          isEnabled: true,
          supportedOperatorConfigsMap: getTextOperatorConfigs(operatorParams, searchPlaceholder, emptyOptions),
        })
      );
    }

    // 模块是内置维度：排在内置列之后、自定义字段之前
    if (moduleOptions) {
      nextConfigs.push(
        createFilterConfig<TRequirementGridFilterProperty>({
          id: REQUIREMENT_MODULE_FILTER_FIELD,
          label: t("requirement_modules.column"),
          icon: Folder,
          isEnabled: true,
          supportedOperatorConfigsMap: getModuleOperatorConfigs(moduleOptions, operatorParams),
        })
      );
    }

    for (const field of customFields) {
      const icon = CUSTOM_FIELD_ICONS[field.field_type] ?? Type;

      if (field.field_type === "text" || field.field_type === "rich_text") {
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: field.id,
            label: field.name,
            icon,
            isEnabled: true,
            supportedOperatorConfigsMap: getTextOperatorConfigs(operatorParams, searchPlaceholder, emptyOptions),
          })
        );
        continue;
      }

      if (field.field_type === "select") {
        const options = getRequirementSelectOptions(field).map((option) => ({
          id: option.id,
          label: option.label,
          value: option.id,
        }));
        const isMultiple = getRequirementSelectMode(field) === "multiple";
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: field.id,
            label: field.name,
            icon,
            isEnabled: options.length > 0,
            supportedOperatorConfigsMap: isMultiple
              ? getContainsSelectOperatorConfigs(options, operatorParams)
              : getExactSelectOperatorConfigs(options, operatorParams),
          })
        );
        continue;
      }

      if (field.field_type === "member") {
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: field.id,
            label: field.name,
            icon,
            isEnabled: members.length > 0,
            supportedOperatorConfigsMap: new Map([
              createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, operatorParams, (updatedParams) =>
                getSingleSelectConfig<IUserLite, string, IUserLite>(
                  {
                    items: members,
                    getId: (member) => member.id,
                    getLabel: (member) => member.display_name,
                    getValue: (member) => member.id,
                    getIconData: (member) => member,
                  },
                  { isOperatorEnabled: updatedParams.isOperatorEnabled },
                  {
                    getOptionIcon: (memberDetails) =>
                      memberDetails ? (
                        <Avatar
                          name={memberDetails.display_name}
                          src={getFileURL(memberDetails.avatar_url)}
                          showTooltip={false}
                          size="sm"
                        />
                      ) : null,
                  }
                )
              ),
            ]),
          })
        );
        continue;
      }

      if (field.field_type === "boolean") {
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: field.id,
            label: field.name,
            icon,
            isEnabled: true,
            supportedOperatorConfigsMap: new Map([
              createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, operatorParams, (updatedParams) =>
                getSingleSelectConfig<(typeof booleanOptions)[number], boolean, undefined>(
                  {
                    items: booleanOptions,
                    getId: (option) => option.id,
                    getLabel: (option) => option.label,
                    getValue: (option) => option.value,
                  },
                  { isOperatorEnabled: updatedParams.isOperatorEnabled }
                )
              ),
            ]),
          })
        );
        continue;
      }

      if (field.field_type === "attachment" || field.field_type === "image") {
        nextConfigs.push(
          createFilterConfig<TRequirementGridFilterProperty>({
            id: field.id,
            label: field.name,
            icon,
            isEnabled: true,
            supportedOperatorConfigsMap: getEmptyOperatorConfigs(emptyOptions, operatorParams),
          })
        );
      }
    }

    return nextConfigs;
  }, [
    booleanOptions,
    builtinColumns,
    customFields,
    emptyOptions,
    entityKind,
    members,
    moduleOptions,
    operatorParams.allowNegative,
    operatorParams.allowedOperators,
    operatorParams.isEnabled,
    priorityOptions,
    searchPlaceholder,
    statusOptions,
    t,
  ]);

  return {
    areAllConfigsInitialized: true,
    configs,
  };
};
