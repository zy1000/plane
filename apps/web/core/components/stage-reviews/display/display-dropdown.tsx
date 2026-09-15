import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import type { TStageReviewScopeKind } from "../scope";
import type { TStageReviewDisplayPatch, TStageReviewDisplaySettings } from "./display-settings";
import {
  STAGE_REVIEW_ORDER_BY,
  getStageReviewDisplayProperties,
  getStageReviewGroupByOptions,
} from "./display-settings";

const I18N = "stage_review.display";

/**
 * 页头的「显示」，照工作项的面板：显示属性 / 分组方式 / 排序方式 / 显示评审活动。
 *
 * 属性与分组选项随作用域变：项目页有「产品」没有「项目」，产品页反过来。
 */
export const StageReviewDisplayDropdown = ({
  scopeKind,
  settings,
  onChange,
}: {
  scopeKind: TStageReviewScopeKind;
  settings: TStageReviewDisplaySettings;
  onChange: (patch: TStageReviewDisplayPatch) => void;
}) => {
  const { t } = useTranslation();
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [isGroupOpen, setIsGroupOpen] = useState(true);
  const [isOrderOpen, setIsOrderOpen] = useState(true);

  return (
    <FiltersDropdown
      miniIcon={<SlidersHorizontal className="size-3.5" />}
      title={t(`${I18N}.title`)}
      placement="bottom-end"
    >
      <div className="vertical-scrollbar relative scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-hidden overflow-y-auto px-2.5">
        <div className="py-2">
          <FilterHeader
            title={t(`${I18N}.properties`)}
            isPreviewEnabled={isPropertiesOpen}
            handleIsPreviewEnabled={() => setIsPropertiesOpen((open) => !open)}
          />
          {isPropertiesOpen && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {getStageReviewDisplayProperties(scopeKind).map((property) => {
                const isActive = settings.properties[property];
                return (
                  <button
                    key={property}
                    type="button"
                    className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                      isActive ? "border-accent-strong bg-accent-primary text-on-color" : "border-subtle hover:bg-layer-1"
                    }`}
                    onClick={() => onChange({ properties: { [property]: !isActive } })}
                  >
                    {t(`${I18N}.property.${property}`)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="py-2">
          <FilterHeader
            title={t(`${I18N}.group_by`)}
            isPreviewEnabled={isGroupOpen}
            handleIsPreviewEnabled={() => setIsGroupOpen((open) => !open)}
          />
          {isGroupOpen &&
            getStageReviewGroupByOptions(scopeKind).map((groupBy) => (
              <FilterOption
                key={groupBy}
                isChecked={settings.groupBy === groupBy}
                title={t(`${I18N}.group.${groupBy}`)}
                multiple={false}
                onClick={() => onChange({ groupBy })}
              />
            ))}
        </div>

        <div className="py-2">
          <FilterHeader
            title={t(`${I18N}.order_by`)}
            isPreviewEnabled={isOrderOpen}
            handleIsPreviewEnabled={() => setIsOrderOpen((open) => !open)}
          />
          {isOrderOpen &&
            STAGE_REVIEW_ORDER_BY.map((orderBy) => (
              <FilterOption
                key={orderBy}
                isChecked={settings.orderBy === orderBy}
                title={t(`${I18N}.order.${orderBy.replace("-", "")}`)}
                multiple={false}
                onClick={() => onChange({ orderBy })}
              />
            ))}
        </div>

        <div className="py-2">
          <FilterOption
            isChecked={settings.showActivities}
            title={t(`${I18N}.show_activities`)}
            onClick={() => onChange({ showActivities: !settings.showActivities })}
          />
          {settings.groupBy !== "none" && (
            <FilterOption
              isChecked={settings.showEmptyGroups}
              title={t(`${I18N}.show_empty_groups`)}
              onClick={() => onChange({ showEmptyGroups: !settings.showEmptyGroups })}
            />
          )}
        </div>
      </div>
    </FiltersDropdown>
  );
};
