import { useMemo } from "react";
import { Package, ShieldCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import {
  DueDatePropertyIcon,
  LayersIcon,
  MembersPropertyIcon,
  PriorityPropertyIcon,
  SearchIcon,
  StartDatePropertyIcon,
  StatePropertyIcon,
} from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TSupportedOperators } from "@plane/types";
import {
  COLLECTION_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
  REQUIREMENT_APPROVAL_STATES,
  REQUIREMENT_PRIORITIES,
  REQUIREMENT_STATUSES,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getAssigneeFilterConfig,
  getFileURL,
  getMultiSelectConfig,
  getSupportedDateOperators,
  getTextInputConfig,
} from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TProjectRequirementFilterProperty } from "./types";

type TSelectOption = {
  id: string;
  label: string;
  value: string;
};

type TProductOption = {
  id: string;
  identifier: string;
  name: string;
};

type TRequirementTypeOption = {
  id: string;
  name: string;
};

const getMultiSelectOperatorConfigs = (
  options: TSelectOption[],
  params: {
    isEnabled: boolean;
    allowedOperators: Set<TSupportedOperators>;
    allowNegative: boolean;
  }
) =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
      getMultiSelectConfig<TSelectOption, string, undefined>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
        },
        {
          singleValueOperator: EQUALITY_OPERATOR.EXACT,
          isOperatorEnabled: updatedParams.isOperatorEnabled,
        }
      )
    ),
  ]);

export const useProjectRequirementFiltersConfig = ({
  workspaceSlug,
  projectId,
  products,
  requirementTypes,
}: {
  workspaceSlug: string;
  projectId: string;
  products: TProductOption[];
  requirementTypes: TRequirementTypeOption[];
}) => {
  const { t } = useTranslation();
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const memberIds = getProjectMemberIds(projectId, false) ?? [];
  const members = useMemo(
    () => memberIds.map((memberId) => getUserDetails(memberId)).filter((member) => member) as IUserLite[],
    [getUserDetails, memberIds]
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

  const approvalOptions = useMemo<TSelectOption[]>(
    () =>
      REQUIREMENT_APPROVAL_STATES.map((state) => ({
        id: state,
        value: state,
        label: t(`requirement_approval.state.${state}`),
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

  const productOptions = useMemo<TSelectOption[]>(
    () =>
      products.map((product) => ({
        id: product.id,
        value: product.id,
        label: product.identifier ? `${product.identifier} ${product.name}` : product.name,
      })),
    [products]
  );

  const typeOptions = useMemo<TSelectOption[]>(
    () =>
      requirementTypes.map((requirementType) => ({
        id: requirementType.id,
        value: requirementType.id,
        label: requirementType.name,
      })),
    [requirementTypes]
  );

  const titleFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "title",
        label: t("requirement_fields.builtin.title"),
        icon: SearchIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: new Map([
          createOperatorConfigEntry(EXTENDED_EQUALITY_OPERATOR.CONTAINS, operatorConfigs, (updatedParams) =>
            getTextInputConfig({
              ...updatedParams,
              placeholder: t("search"),
            })
          ),
        ]),
      }),
    [operatorConfigs, t]
  );

  const statusFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "status",
        label: t("requirement_fields.builtin.status"),
        icon: StatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(statusOptions, {
          isEnabled: true,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, statusOptions, t]
  );

  const productFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "product",
        label: t("project_requirements.product_column"),
        icon: Package,
        isEnabled: productOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(productOptions, {
          isEnabled: productOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, productOptions, t]
  );

  const approvalFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "approval",
        label: t("requirement_approval.column"),
        icon: ShieldCheck,
        isEnabled: true,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(approvalOptions, {
          isEnabled: true,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [approvalOptions, operatorConfigs.allowNegative, operatorConfigs.allowedOperators, t]
  );

  const priorityFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "priority",
        label: t("requirement_fields.builtin.priority"),
        icon: PriorityPropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(priorityOptions, {
          isEnabled: true,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, priorityOptions, t]
  );

  const assigneeFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      getAssigneeFilterConfig<TProjectRequirementFilterProperty>("assignee")({
        isEnabled: members.length > 0,
        filterIcon: MembersPropertyIcon,
        members,
        getOptionIcon: (memberDetails) => (
          <Avatar
            name={memberDetails.display_name}
            src={getFileURL(memberDetails.avatar_url)}
            showTooltip={false}
            size="sm"
          />
        ),
        ...operatorConfigs,
      }),
    [members, operatorConfigs]
  );

  const startDateFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "start_date",
        label: t("requirement_fields.builtin.start_date"),
        icon: StartDatePropertyIcon,
        isEnabled: true,
        allowMultipleFilters: true,
        supportedOperatorConfigsMap: getSupportedDateOperators({
          isEnabled: true,
          filterIcon: StartDatePropertyIcon,
          ...operatorConfigs,
        }),
      }),
    [operatorConfigs, t]
  );

  const targetDateFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "target_date",
        label: t("requirement_fields.builtin.target_date"),
        icon: DueDatePropertyIcon,
        isEnabled: true,
        allowMultipleFilters: true,
        supportedOperatorConfigsMap: getSupportedDateOperators({
          isEnabled: true,
          filterIcon: DueDatePropertyIcon,
          ...operatorConfigs,
        }),
      }),
    [operatorConfigs, t]
  );

  const typeFilterConfig = useMemo<TFilterConfig<TProjectRequirementFilterProperty>>(
    () =>
      createFilterConfig<TProjectRequirementFilterProperty>({
        id: "requirement_type",
        label: t("requirement_detail.requirement_type"),
        icon: LayersIcon,
        isEnabled: typeOptions.length > 0,
        supportedOperatorConfigsMap: getMultiSelectOperatorConfigs(typeOptions, {
          isEnabled: typeOptions.length > 0,
          allowedOperators: operatorConfigs.allowedOperators,
          allowNegative: operatorConfigs.allowNegative,
        }),
      }),
    [operatorConfigs.allowNegative, operatorConfigs.allowedOperators, t, typeOptions]
  );

  return {
    areAllConfigsInitialized: true,
    configs: [
      titleFilterConfig,
      statusFilterConfig,
      productFilterConfig,
      approvalFilterConfig,
      priorityFilterConfig,
      assigneeFilterConfig,
      startDateFilterConfig,
      targetDateFilterConfig,
      typeFilterConfig,
    ],
  };
};
