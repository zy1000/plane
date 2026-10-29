// plane imports
import type { TProjectStage, TFilterProperty } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

/** 与 apps/web 的 projectStage store 给出的 getProjectStageOptions 结构一致（树先序 + 深度） */
export type TStageFilterOption = { stage: TProjectStage; depth: number };

export type TCreateStageFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<undefined> & {
    stages: TStageFilterOption[];
  };

/** 根阶段「编码 名称」，子阶段按深度缩进只显示名称，与下拉的展示规则一致。 */
export const getStageFilterOptionLabel = ({ stage, depth }: TStageFilterOption) =>
  depth > 0 ? `${"　".repeat(depth - 1)}└ ${stage.name}` : `${stage.code} ${stage.name}`;

/** 工作项「阶段」筛选：候选是项目阶段（父子都可选），照 product.ts。 */
export const getStageMultiSelectConfig = (params: TCreateStageFilterParams) =>
  getMultiSelectConfig<TStageFilterOption, string, undefined>(
    {
      items: params.stages,
      getId: (option) => option.stage.id,
      getLabel: getStageFilterOptionLabel,
      getValue: (option) => option.stage.id,
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

export const getStageFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateStageFilterParams> =>
  (params: TCreateStageFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "阶段",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getStageMultiSelectConfig(updatedParams)
        ),
      ]),
    });
