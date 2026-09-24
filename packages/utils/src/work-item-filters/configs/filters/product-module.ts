// plane imports
import type { TFlatProductModule, TFilterProperty } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

export type TCreateProductModuleFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<undefined> & {
    modules: TFlatProductModule[];
  };

/** 工作项「产品模块」筛选：候选是项目所有关联产品的模块，label 用路径以区分同名子模块。 */
export const getProductModuleMultiSelectConfig = (params: TCreateProductModuleFilterParams) =>
  getMultiSelectConfig<TFlatProductModule, string, undefined>(
    {
      items: params.modules,
      getId: (module) => module.id,
      getLabel: (module) => module.path,
      getValue: (module) => module.id,
      getIconData: () => undefined,
    },
    {
      singleValueOperator: EQUALITY_OPERATOR.EXACT,
      ...params,
    },
    {
      ...params,
    }
  );

export const getProductModuleFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateProductModuleFilterParams> =>
  (params: TCreateProductModuleFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "产品模块",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getProductModuleMultiSelectConfig(updatedParams)
        ),
      ]),
    });
