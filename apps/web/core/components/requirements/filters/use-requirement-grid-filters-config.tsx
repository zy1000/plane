import { useMemo } from "react";
import {
  AlignLeft,
  FileImage,
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
  TSupportedOperators,
} from "@plane/types";
import { EQUALITY_OPERATOR, EXTENDED_EQUALITY_OPERATOR, REQUIREMENT_PRIORITIES, REQUIREMENT_STATUSES } from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getFileURL,
  getSingleSelectConfig,
  getTextInputConfig,
} from "@plane/utils";
import { getBuiltinColumnsFor, REQUIREMENT_BUILTIN_COLUMNS } from "@/components/requirements/requirement-builtin-fields";
import { getRequirementSelectMode, getRequirementSelectOptions } from "@/components/requirements/requirement-select";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import {
  REQUIREMENT_EMPTY_FILTER_VALUE,
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
  customFields,
}: {
  workspaceSlug: string;
  entityKind: "product" | "library";
  customFields: TRequirementField[];
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

  const searchPlaceholder = t("search");
  const operatorParams: TOperatorParams = {
    isEnabled: true,
    allowedOperators: operatorConfigs.allowedOperators,
    allowNegative: operatorConfigs.allowNegative,
  };

  const configs = useMemo(() => {
    const nextConfigs: TFilterConfig<TRequirementGridFilterProperty>[] = [];
    const builtinByKey = Object.fromEntries(REQUIREMENT_BUILTIN_COLUMNS.map((column) => [column.key, column]));

    for (const column of getBuiltinColumnsFor(entityKind)) {
      const icon = builtinByKey[column.key]?.icon;
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
    customFields,
    emptyOptions,
    entityKind,
    members,
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
