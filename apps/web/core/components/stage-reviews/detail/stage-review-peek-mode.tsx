import { useTranslation } from "@plane/i18n";
import { CenterPanelIcon, FullScreenPanelIcon, SidePanelIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";

/** 抽屉的三种摆法，与工作项 peek 一致：侧边 / 居中 / 全屏 */
export type TStageReviewPeekMode = "side-peek" | "modal" | "full-screen";

const PEEK_OPTIONS: { key: TStageReviewPeekMode; icon: typeof SidePanelIcon; i18nKey: string }[] = [
  { key: "side-peek", icon: SidePanelIcon, i18nKey: "common.side_peek" },
  { key: "modal", icon: CenterPanelIcon, i18nKey: "common.modal" },
  { key: "full-screen", icon: FullScreenPanelIcon, i18nKey: "common.full_screen" },
];

/** 面板定位类，照工作项 `peek-overview/view.tsx`；侧边模式比工作项宽一档，要铺开正文 + 属性栏 */
export const STAGE_REVIEW_PEEK_PANEL_CLASS: Record<TStageReviewPeekMode, string> = {
  "side-peek": "top-0 right-0 bottom-0 w-full border-l md:w-[88%] xl:w-[78%] 2xl:w-[70%]",
  modal: "top-[8.33%] left-[8.33%] size-5/6 rounded-md border",
  "full-screen": "inset-0 m-4 rounded-md border",
};

/** 头一行里的模式切换：当前模式的图标当按钮，点开选另外两种 —— 同工作项 peek 头部 */
export const StageReviewPeekModeSelect = ({
  mode,
  onChange,
}: {
  mode: TStageReviewPeekMode;
  onChange: (mode: TStageReviewPeekMode) => void;
}) => {
  const { t } = useTranslation();
  const current = PEEK_OPTIONS.find((option) => option.key === mode) ?? PEEK_OPTIONS[0];

  return (
    <CustomSelect
      value={current.key}
      onChange={(value: TStageReviewPeekMode) => onChange(value)}
      customButton={
        <Tooltip tooltipContent={t("common.toggle_peek_view_layout")}>
          <span className="grid size-7 place-items-center rounded-md text-tertiary transition hover:bg-layer-2 hover:text-secondary">
            <current.icon className="size-4" />
          </span>
        </Tooltip>
      }
      customButtonClassName="flex"
    >
      {PEEK_OPTIONS.map((option) => (
        <CustomSelect.Option key={option.key} value={option.key}>
          <span
            className={cn(
              "flex items-center gap-1.5",
              option.key === current.key ? "text-secondary" : "text-placeholder hover:text-secondary"
            )}
          >
            <option.icon className="-my-1 size-4 shrink-0" />
            {t(option.i18nKey)}
          </span>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
};
