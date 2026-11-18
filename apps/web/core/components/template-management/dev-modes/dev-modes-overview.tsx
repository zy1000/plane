import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate } from "react-router";
import { Check, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { DEFAULT_DEV_MODE_NAME, DEV_MODE_FEATURE_KEYS } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { toTypeIconProps, TypeIcon } from "@/components/common/type-icon-picker";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useTemplatePermissions } from "../permissions";
import { useTemplateCenter } from "../template-center-context";
import { TemplatePageHeader, TemplatePageSearch } from "../template-page-header";
import { DevModeFormModal, type TDevModeFormValue } from "./dev-mode-form-modal";
import { DEV_MODE_I18N } from "./dev-modes-grid";
import { devModeDetailPath } from "./routes";
import { getStageFamily, STAGE_FAMILY_SOFT } from "./stage-family";

/** 对比的组件：模块已下线（全部项目、模式的开关都关了），这里不再占一列；组件页的开关仍保留 */
const COMPARE_FEATURE_KEYS = DEV_MODE_FEATURE_KEYS.filter((key) => key !== "module_view");

/** 对比表的列：模式 · 阶段 · 评审节点 · 在用项目 · 八个组件 · 进入 */
const COMPARE_GRID = "grid grid-cols-[minmax(0,1fr)_56px_72px_76px_repeat(8,40px)_24px] items-center gap-x-1.5";

/**
 * 「全部模式对比」（方案 A）：原来的模式卡片列表改成一张对比表 + 阶段路线。
 * 各模式开了哪些组件、走哪几个阶段并排一眼看清；点一行进模式页。
 */
export const DevModesOverview = observer(function DevModesOverview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaceSlug, modes } = useTemplateCenter();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const [query, setQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const visibleModes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return modes.devModes;
    return modes.devModes.filter(
      (item) => item.name.toLowerCase().includes(keyword) || (item.description ?? "").toLowerCase().includes(keyword)
    );
  }, [modes.devModes, query]);

  const handleCreate = async (value: TDevModeFormValue) => {
    const created = await modes.createDevMode({
      name: value.name,
      description: value.description,
      icon_props: { in_use: "icon" as const, icon: toTypeIconProps(value.icon) },
      features: value.features,
    });
    setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.created`) });
    setIsCreating(false);
    if (created) navigate(devModeDetailPath(workspaceSlug, created.id));
  };

  const renderBody = () => {
    if (modes.isLoading) {
      return (
        <Loader className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <Loader.Item key={index} height="66px" />
          ))}
        </Loader>
      );
    }
    if (modes.error) {
      return (
        <div className="rounded-xl border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.error_title`)}</p>
          <p className="mt-1 text-12 text-secondary">{modes.error}</p>
          <Button className="mt-4" variant="secondary" onClick={() => void modes.fetchDevModes().catch(() => undefined)}>
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (visibleModes.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-subtle px-6 py-12 text-center">
          <p className="text-14 font-medium text-primary">
            {t(query ? `${DEV_MODE_I18N}.empty.no_match_title` : `${DEV_MODE_I18N}.empty.title`)}
          </p>
          <p className="mt-1 text-12 text-secondary">
            {t(query ? `${DEV_MODE_I18N}.empty.no_match_description` : `${DEV_MODE_I18N}.empty.description`)}
          </p>
        </div>
      );
    }

    return (
      <>
        <div className="horizontal-scrollbar scrollbar-sm overflow-x-auto rounded-lg border border-subtle">
          <div className="min-w-[800px]">
            <div className={cn(COMPARE_GRID, "h-10 bg-surface-2 pl-4 pr-3 text-13 font-medium text-secondary")}>
              <span>模式</span>
              <span className="text-right">阶段</span>
              <span className="text-right">评审节点</span>
              <span className="text-right">在用项目</span>
              {COMPARE_FEATURE_KEYS.map((key) => (
                <span key={key} className="truncate text-center" title={t(`${DEV_MODE_I18N}.features.${key}`)}>
                  {key === "is_issue_type_enabled" ? "类型" : t(`${DEV_MODE_I18N}.features.${key}`)}
                </span>
              ))}
              <span />
            </div>
            {visibleModes.map((mode) => {
              const isDefault = mode.is_system && mode.name === DEFAULT_DEV_MODE_NAME;
              return (
                <Link
                  key={mode.id}
                  to={devModeDetailPath(workspaceSlug, mode.id)}
                  className={cn(COMPARE_GRID, "min-h-[66px] border-t border-subtle pl-4 pr-3 transition-colors hover:bg-layer-transparent-hover")}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <TypeIcon iconProps={mode.icon_props?.icon} className="size-8 rounded-[9px] bg-layer-1" iconClassName="size-4" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-14 font-semibold text-primary">
                        <span className="truncate">{mode.name}</span>
                        <span
                          className={cn(
                            "inline-flex h-5 shrink-0 items-center rounded px-1.5 text-11 font-medium",
                            isDefault ? "bg-accent-subtle text-accent-primary" : "bg-layer-1 text-secondary"
                          )}
                        >
                          {isDefault
                            ? "默认"
                            : t(mode.is_system ? `${DEV_MODE_I18N}.card.preset` : `${DEV_MODE_I18N}.card.custom`)}
                        </span>
                      </span>
                      <span className="block truncate text-12 text-tertiary">
                        {mode.description || t(`${DEV_MODE_I18N}.card.no_description`)}
                      </span>
                    </span>
                  </span>
                  {[mode.stage_count, mode.template_count, mode.project_count].map((value, index) => (
                    <span
                      key={index}
                      className={cn(
                        "text-right text-14 tabular-nums",
                        value ? "font-semibold text-primary" : "font-medium text-placeholder"
                      )}
                    >
                      {value}
                    </span>
                  ))}
                  {COMPARE_FEATURE_KEYS.map((key) => (
                    <span key={key} className="flex justify-center">
                      {mode.features?.[key] ? (
                        <span className="grid size-[18px] place-items-center rounded-full bg-accent-subtle text-accent-primary">
                          <Check className="size-[11px]" strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="h-0.5 w-2.5 rounded-full bg-layer-3" />
                      )}
                    </span>
                  ))}
                  <ChevronRight className="size-4 text-placeholder" />
                </Link>
              );
            })}
          </div>
        </div>

        <section className="mt-6">
          <h2 className="mb-2.5 text-[15px] font-semibold text-primary">阶段路线</h2>
          <div className="overflow-hidden rounded-lg border border-subtle">
            {visibleModes.map((mode, index) => {
              const stages = mode.stage_brief ?? [];
              return (
                <div
                  key={mode.id}
                  className={cn("grid grid-cols-[150px_minmax(0,1fr)] items-center gap-4 px-4 py-3.5", index > 0 && "border-t border-subtle")}
                >
                  <span className="truncate text-14 font-semibold text-primary">{mode.name}</span>
                  {stages.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                      {stages.map((stage, stageIndex) => (
                        <span key={stage.id} className="flex items-center gap-1">
                          {stageIndex > 0 && <ChevronRight className="size-3 text-placeholder" />}
                          <span
                            className={cn(
                              "inline-flex h-[26px] items-center rounded-md px-2 text-12 font-medium",
                              STAGE_FAMILY_SOFT[getStageFamily(stage.name)]
                            )}
                          >
                            {stage.name}
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="text-13 text-tertiary">
                      {mode.features?.review_view === false ? "不走阶段评审" : "还没有阶段"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  };

  return (
    <>
      <PageHead title={t(`${DEV_MODE_I18N}.title`)} />
      <ContentWrapper className="flex min-h-0 flex-col bg-surface-1">
        <TemplatePageHeader
          title={t(`${DEV_MODE_I18N}.title`)}
          count={modes.isLoading ? undefined : modes.devModes.length}
        >
          <TemplatePageSearch
            value={query}
            onChange={setQuery}
            placeholder={t(`${DEV_MODE_I18N}.search_placeholder`)}
          />
          {canManageDevModes && (
            <Button variant="primary" size="xl" className="px-3" onClick={() => setIsCreating(true)}>
              {t(`${DEV_MODE_I18N}.create`)}
            </Button>
          )}
        </TemplatePageHeader>
        <div className="flex flex-col px-7 py-6">{renderBody()}</div>
      </ContentWrapper>

      <DevModeFormModal
        isOpen={isCreating}
        devMode={null}
        isSubmitting={modes.isMutating}
        onClose={() => setIsCreating(false)}
        onSubmit={handleCreate}
      />
    </>
  );
});
