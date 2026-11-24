// plane imports
import type { TProductOption, TFilterProperty } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

export type TCreateProductFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<TProductOption> & {
    products: TProductOption[];
  };

/**
 * 工作项「产品」筛选：候选是项目关联产品池，照 release.ts。
 * 候选顺序由 store 按父子排好（产品集后面紧跟集内产品），图标交给调用方区分产品集 / 集内产品。
 */
export const getProductMultiSelectConfig = (params: TCreateProductFilterParams) =>
  getMultiSelectConfig<TProductOption, string, TProductOption>(
    {
      items: params.products,
      getId: (product) => product.id,
      getLabel: (product) => product.name,
      getValue: (product) => product.id,
      getIconData: (product) => product,
    },
    {
      singleValueOperator: EQUALITY_OPERATOR.EXACT,
      ...params,
    },
    {
      ...params,
    }
  );

export const getProductFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateProductFilterParams> =>
  (params: TCreateProductFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "产品",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getProductMultiSelectConfig(updatedParams)
        ),
      ]),
    });
