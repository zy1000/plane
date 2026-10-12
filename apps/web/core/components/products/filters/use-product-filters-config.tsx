import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Barcode,
  Box,
  Calendar,
  CalendarClock,
  CircleDot,
  Code,
  Cpu,
  FlaskConical,
  Globe2,
  Hash,
  History,
  Layers,
  Lock,
  Shapes,
  Tag,
  UserCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { StartDatePropertyIcon } from "@plane/propel/icons";
import type {
  IUserLite,
  TDataDictionary,
  TDataDictionaryItemLite,
  TFilterConfig,
  TProduct,
  TSupportedOperators,
} from "@plane/types";
import {
  COLLECTION_OPERATOR,
  COMPARISON_OPERATOR,
  EProductDictionaryKey,
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
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { useFiltersOperatorConfigs } from "@/plane-web/hooks/rich-filters/use-filters-operator-configs";
import type { TProductFilterProperty } from "./types";
import { PRODUCT_FILTER_ME, PRODUCT_FILTER_NONE } from "./types";

const I18N = "workspace_products";

type TOption = { id: string; label: string; value: string; icon?: ReactNode };

type TOperatorParams = {
  isEnabled: boolean;
  allowedOperators: Set<TSupportedOperators>;
  allowNegative: boolean;
  /** createOperatorConfigEntry 回填，这里声明出来只是为了在回调里能类型安全地读 */
  isOperatorEnabled?: boolean;
};

type TProductDictionaryField = Extract<
  TProductFilterProperty,
  "stage" | "category" | "status" | "hardware_level" | "structure_level" | "software_level"
>;

const DICTIONARY_KEY_BY_FIELD: Record<TProductDictionaryField, EProductDictionaryKey> = {
  stage: EProductDictionaryKey.STAGE,
  category: EProductDictionaryKey.CATEGORY,
  status: EProductDictionaryKey.STATUS,
  hardware_level: EProductDictionaryKey.HARDWARE_LEVEL,
  structure_level: EProductDictionaryKey.STRUCTURE_LEVEL,
  software_level: EProductDictionaryKey.SOFTWARE_LEVEL,
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

const byLabel = (a: TOption, b: TOption) => a.label.localeCompare(b.label);

/**
 * 产品列表筛选行可加的属性。
 *
 * - 六个字典字段列全部字典值，字典开了彩色就带色点；字典还没到时退回已加载产品的 `*_detail`；末尾「未设置」给存量空值用
 * - 项目代号 / 型号 / 外部型号从已加载的产品里收集去重
 * - 负责人 / 项目负责人 / 测试负责人 / 评审人只列真的带过产品的人，首项都是「我」
 */
export const useProductFiltersConfig = ({
  workspaceSlug,
  products,
  currentUser,
}: {
  workspaceSlug: string;
  products: TProduct[];
  currentUser: Pick<IUserLite, "id" | "display_name" | "avatar_url"> | undefined;
}) => {
  const { t } = useTranslation();
  const operatorConfigs = useFiltersOperatorConfigs({ workspaceSlug });
  const { dictionaries } = useDataDictionaries(workspaceSlug);

  const configs = useMemo<TFilterConfig<TProductFilterProperty>[]>(() => {
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
      id: PRODUCT_FILTER_NONE,
      value: PRODUCT_FILTER_NONE,
      label: t(`${I18N}.fields.not_set`),
    };
    const meOption: TOption[] = currentUser
      ? [{ id: PRODUCT_FILTER_ME, value: PRODUCT_FILTER_ME, label: t(`${I18N}.filters.me`), icon: avatar(currentUser) }]
      : [];

    const dictionaryOptions = (field: TProductDictionaryField): TOption[] => {
      const dictionary: TDataDictionary | undefined = dictionaries.find(
        (entry) => entry.key === DICTIONARY_KEY_BY_FIELD[field]
      );
      let items: Pick<TDataDictionaryItemLite, "id" | "label" | "color" | "is_colored">[];
      if (dictionary) {
        items = dictionary.items.map((item) => ({ ...item, is_colored: dictionary.is_colored }));
      } else {
        // 字典接口还没回来（或失败）时，用产品自带的 detail 兜底，保证筛选可用
        const seen = new Map<string, TDataDictionaryItemLite>();
        for (const product of products) {
          const detail = product[`${field}_detail`];
          if (detail && !seen.has(detail.id)) seen.set(detail.id, detail);
        }
        items = [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
      }
      return [
        ...items.map((item) => {
          const color = resolveDictionaryItemColor(item);
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

    const textOptions = (pick: (product: TProduct) => string | null | undefined, withNone: boolean): TOption[] => {
      const values = new Set<string>();
      for (const product of products) {
        const value = pick(product)?.trim();
        if (value) values.add(value);
      }
      const options = [...values].map((value) => ({ id: value, value, label: value })).sort(byLabel);
      return withNone ? [...options, noneOption] : options;
    };

    const peopleOptions = (pick: (product: TProduct) => (IUserLite | null | undefined)[], withNone: boolean) => {
      const users = new Map<string, IUserLite>();
      for (const product of products) {
        for (const user of pick(product)) {
          if (user && !users.has(user.id)) users.set(user.id, user);
        }
      }
      const options = [...users.values()]
        .map((user) => ({ id: user.id, value: user.id, label: user.display_name, icon: avatar(user) }))
        .sort(byLabel);
      return withNone ? [...meOption, ...options, noneOption] : [...meOption, ...options];
    };

    const dictionaryConfig = (field: TProductDictionaryField, icon: TFilterConfig<TProductFilterProperty>["icon"]) =>
      createFilterConfig<TProductFilterProperty>({
        id: field,
        label: t(`${I18N}.fields.${field}`),
        icon,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(dictionaryOptions(field), params, isLabel),
      });

    const dateConfig = (
      field: Extract<
        TProductFilterProperty,
        "start_date" | "o_phase_close_date" | "v_phase_close_date" | "created_at" | "updated_at"
      >,
      icon: TFilterConfig<TProductFilterProperty>["icon"]
    ) =>
      createFilterConfig<TProductFilterProperty>({
        id: field,
        label: t(`${I18N}.fields.${field}`),
        icon,
        isEnabled: true,
        supportedOperatorConfigsMap: dateOperators(params, dateLabels),
      });

    return [
      createFilterConfig<TProductFilterProperty>({
        id: "code",
        label: t(`${I18N}.fields.code`),
        icon: Tag,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          textOptions((product) => product.code, false),
          params,
          isLabel
        ),
      }),
      dictionaryConfig("stage", Layers),
      dictionaryConfig("category", Shapes),
      dictionaryConfig("status", CircleDot),
      dictionaryConfig("hardware_level", Cpu),
      dictionaryConfig("structure_level", Box),
      dictionaryConfig("software_level", Code),
      createFilterConfig<TProductFilterProperty>({
        id: "owner",
        label: t(`${I18N}.fields.owner`),
        icon: UserCheck,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          peopleOptions((product) => [product.owner_detail], false),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProductFilterProperty>({
        id: "project_lead",
        label: t(`${I18N}.fields.project_lead`),
        icon: UserCog,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          peopleOptions((product) => [product.project_lead_detail], true),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProductFilterProperty>({
        id: "test_lead",
        label: t(`${I18N}.fields.test_lead`),
        icon: FlaskConical,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          peopleOptions((product) => [product.test_lead_detail], true),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProductFilterProperty>({
        id: "reviewers",
        label: t(`${I18N}.fields.reviewers`),
        icon: Users,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          peopleOptions((product) => product.reviewer_details ?? [], true),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProductFilterProperty>({
        id: "network",
        label: t(`${I18N}.fields.visibility`),
        icon: Lock,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          [
            { id: "0", value: "0", label: t(`${I18N}.visibility.private`), icon: <Lock className="size-3.5" /> },
            { id: "2", value: "2", label: t(`${I18N}.visibility.public`), icon: <Globe2 className="size-3.5" /> },
          ],
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProductFilterProperty>({
        id: "model_number",
        label: t(`${I18N}.fields.model_number`),
        icon: Hash,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          textOptions((product) => product.model_number, true),
          params,
          isLabel
        ),
      }),
      createFilterConfig<TProductFilterProperty>({
        id: "external_model",
        label: t(`${I18N}.fields.external_model`),
        icon: Barcode,
        isEnabled: true,
        supportedOperatorConfigsMap: multiSelect(
          textOptions((product) => product.external_model, true),
          params,
          isLabel
        ),
      }),
      dateConfig("start_date", StartDatePropertyIcon),
      dateConfig("o_phase_close_date", CalendarClock),
      dateConfig("v_phase_close_date", CalendarClock),
      dateConfig("created_at", Calendar),
      dateConfig("updated_at", History),
    ];
    // t 每次渲染都是新引用，放进依赖会让配置每帧重建、筛选行反复重注册；语言切换极少，忽略它
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, dictionaries, currentUser, operatorConfigs.allowedOperators, operatorConfigs.allowNegative]);

  return configs;
};
