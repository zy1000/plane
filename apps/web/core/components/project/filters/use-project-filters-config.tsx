import type { ReactNode } from "react";
import { useMemo } from "react";
import { Building2, Calendar, CircleDot, Globe2, Lock, Package, Route, Tag, UserCheck, Users } from "lucide-react";
import { PROJECT_PRODUCT_TYPE_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { DueDatePropertyIcon, MembersPropertyIcon, StartDatePropertyIcon } from "@plane/propel/icons";
import type { IUserLite, TFilterConfig, TProject, TProjectFilterProperty, TSupportedOperators } from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EQUALITY_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
} from "@plane/types";
import { Avatar } from "@plane/ui";
import {
  createFilterConfig,
  createOperatorConfigEntry,
  getDatePickerConfig,
  getDateRangePickerConfig,
  getFileURL,
  getMultiSelectConfig,
} from "@plane/utils";
import { DictionaryColorDot, resolveDictionaryItemColor } from "@/components/data-dictionaries";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import { resolveProjectStatusColor } from "../status-color";
import type { TProjectDictionaryField, TProjectListLookups } from "./use-project-list-lookups";
import { PROJECT_FILTER_ME, PROJECT_FILTER_NONE } from "./types";

const I18N = "workspace_projects";

type TOption = { id: string; label: string; value: string; icon?: ReactNode };

type TOperatorParams = {
  isEnabled: boolean;
  allowedOperators: Set<TSupportedOperators>;
  allowNegative: boolean;
  /** createOperatorConfigEntry 回填，这里声明出来只是为了在回调里能类型安全地读 */
  isOperatorEnabled?: boolean;
};

/** 日期字段额外放行「早于 / 晚于」：CE 的 useFiltersOperatorConfigs 只给 exact / in / range */
const DATE_OPERATORS = new Set<TSupportedOperators>([
  EQUALITY_OPERATOR.EXACT,
  COMPARISON_OPERATOR.RANGE,
  EXTENDED_COMPARISON_OPERATOR.LT,
  EXTENDED_COMPARISON_OPERATOR.GT,
]);

const multiSelect = (options: TOption[], params: TOperatorParams, operatorLabel: string) =>
  new Map([
    createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updated) =>
      getMultiSelectConfig<TOption, string, TOption>(
        {
          items: options,
          getId: (option) => option.id,
          getLabel: (option) => option.label,
          getValue: (option) => option.value,
          getIconData: (option) => option,
        },
        // 只选一个值时也按 IN 显示，否则会落到 map 里没有的 EXACT、标签变成英文 "is"
        { singleValueOperator: COLLECTION_OPERATOR.IN, isOperatorEnabled: updated.isOperatorEnabled, operatorLabel },
        { getOptionIcon: (option) => option.icon }
      )
    ),
  ]);

const dateOperators = (
  params: TOperatorParams,
  labels: { is: string; between: string; before: string; after: string }
) => {
  const dateParams: TOperatorParams = { ...params, allowedOperators: DATE_OPERATORS };
  return new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, dateParams, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.is })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.LT, dateParams, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.before })
    ),
    createOperatorConfigEntry(EXTENDED_COMPARISON_OPERATOR.GT, dateParams, (updated) =>
      getDatePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.after })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, dateParams, (updated) =>
      getDateRangePickerConfig({ isOperatorEnabled: updated.isOperatorEnabled, operatorLabel: labels.between })
    ),
  ]);
};

const avatar = (user: Pick<IUserLite, "display_name" | "avatar_url">) => (
  <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} size="sm" />
);

/**
 * 项目列表筛选行可加的属性。
 *
 * - 字典字段（状态 / 类型 / BU）列全部字典值，字典开了彩色就带色点；末尾「未设置」给存量空值用
 * - 负责人 / 研发产品经理只列真的带过项目的人，成员列全工作区成员；三者首项都是「我」
 * - 研发模式从已加载的项目里收集，不另打接口
 */
export const useProjectFiltersConfig = ({
  workspaceSlug,
  projects,
  lookups,
  currentUser,
  workspaceMemberIds,
  getUserDetails,
}: {
  workspaceSlug: string;
  projects: TProject[];
  lookups: TProjectListLookups;
  currentUser: Pick<IUserLite, "id" | "display_name" | "avatar_url"> | undefined;
  workspaceMemberIds: string[];
  getUserDetails: (userId: string) => IUserLite | undefined;
}) => {
  const { t } = useTranslation();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });

  const configs = useMemo<TFilterConfig<TProjectFilterProperty>[]>(() => {
    const params: TOperatorParams = {
      isEnabled: true,
      allowedOperators: operatorConfigs.allowedOperators,
      allowNegative: operatorConfigs.allowNegative,
    };
    const isLabel = t(`${I18N}.filters.operator_is`);
    const dateLabels = {
      is: isLabel,
      between: t(`${I18N}.filters.operator_between`),
      before: t(`${I18N}.filters.operator_before`),
      after: t(`${I18N}.filters.operator_after`),
    };
    const noneOption: TOption = {
      id: PROJECT_FILTER_NONE,
      value: PROJECT_FILTER_NONE,
      label: t(`${I18N}.fields.not_set`),
    };
    const meOption: TOption[] = currentUser
      ? [{ id: PROJECT_FILTER_ME, value: PROJECT_FILTER_ME, label: t(`${I18N}.filters.me`), icon: avatar(currentUser) }]
      : [];

    const dictionaryOptions = (field: TProjectDictionaryField): TOption[] => {
      const dictionary = lookups.getDictionary(field);
      const items = dictionary?.items ?? [];
      return [
        ...items.map((item) => {
          // 状态在列表里永远带色，筛选选项的色点与之一致
          const color =
            field === "status"
              ? resolveProjectStatusColor(item, dictionary)
              : resolveDictionaryItemColor(item, dictionary);
          return {
            id: item.id,
            value: item.id,
            label: item.label,
            icon: color ? <DictionaryColorDot color={color} size="sm" /> : undefined,
          };
        }),
        noneOption,
      ];
    };

    const peopleFromProjects = (pick: (project: TProject) => string | null | undefined): TOption[] => {
      const ids = new Set<string>();
      for (const project of projects) {
        const id = pick(project);
        if (id) ids.add(id);
      }
      const options = [...ids]
        .map((id) => getUserDetails(id))
        .filter((user): user is IUserLite => Boolean(user))
        .map((user) => ({ id: user.id, value: user.id, label: user.display_name, icon: avatar(user) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      return [...meOption, ...options, noneOption];
    };

    const memberOptions: TOption[] = [
      ...meOption,
      ...workspaceMemberIds
        .map((id) => getUserDetails(id))
        .filter((user): user is IUserLite => Boolean(user))
        .map((user) => ({ id: user.id, value: user.id, label: user.display_name, icon: avatar(user) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];

    const devModes = new Map<string, TOption>();
    for (const project of projects) {
      if (project.dev_mode && project.dev_mode_detail && !devModes.has(project.dev_mode)) {
        devModes.set(project.dev_mode, {
          id: project.dev_mode,
          value: project.dev_mode,
          label: project.dev_mode_detail.name,
        });
      }
    }

    return [
      createFilterConfig<TProjectFilterProperty>({
        id: "status",
        label: t(`${I18N}.fields.status`),
        icon: CircleDot,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(dictionaryOptions("status"), params, isLabel),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "project_type",
        label: t(`${I18N}.fields.project_type`),
        icon: Tag,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(dictionaryOptions("project_type"), params, isLabel),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "business_unit",
        label: t(`${I18N}.fields.business_unit`),
        icon: Building2,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(dictionaryOptions("business_unit"), params, isLabel),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "product_type",
        label: t(`${I18N}.fields.product_type`),
        icon: Package,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [...PROJECT_PRODUCT_TYPE_OPTIONS.map((type) => ({ id: type, value: type, label: type })), noneOption],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "dev_mode",
        label: t(`${I18N}.fields.dev_mode`),
        icon: Route,
        isEnabled: devModes.size > 0,
        supportedOperatorConfigsMap: multiSelect(
          [...devModes.values()].sort((a, b) => a.label.localeCompare(b.label)),
          { ...params, isEnabled: devModes.size > 0 },
          isLabel
        ),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "lead",
        label: t(`${I18N}.fields.project_lead`),
        icon: MembersPropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          peopleFromProjects((project) =>
            typeof project.project_lead === "string" ? project.project_lead : project.project_lead?.id
          ),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "product_manager",
        label: t(`${I18N}.fields.product_manager`),
        icon: UserCheck,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(peopleFromProjects((project) => project.product_manager), params, isLabel),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "members",
        label: t(`${I18N}.fields.members`),
        icon: Users,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(memberOptions, params, isLabel),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "network",
        label: t(`${I18N}.fields.network`),
        icon: Lock,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [
            { id: "0", value: "0", label: t(`${I18N}.network.private.title`), icon: <Lock className="size-3.5" /> },
            { id: "2", value: "2", label: t(`${I18N}.network.public.title`), icon: <Globe2 className="size-3.5" /> },
          ],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "start_date",
        label: t(`${I18N}.fields.start_date`),
        icon: StartDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "end_date",
        label: t(`${I18N}.fields.end_date`),
        icon: DueDatePropertyIcon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
      createFilterConfig<TProjectFilterProperty>({
        id: "created_at",
        label: t(`${I18N}.fields.created_at`),
        icon: Calendar,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      }),
    ];
    // t 每次渲染都是新引用，放进依赖会让配置每帧重建、筛选行反复重注册；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projects,
    lookups,
    currentUser,
    workspaceMemberIds,
    getUserDetails,
    operatorConfigs.allowedOperators,
    operatorConfigs.allowNegative,
  ]);

  return configs;
};
