"use client";

import { useState } from "react";
import { PackageOpen } from "lucide-react";
import { useForm } from "react-hook-form";
import { RANDOM_EMOJI_CODES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { EFileAssetType } from "@plane/types";
import type { TCreateProductPayload, TLogoProps } from "@plane/types";
import { cn, getAssetIdFromUrl } from "@plane/utils";
import { CoverImage } from "@/components/common/cover-image";
import { ImagePickerPopover } from "@/components/core/image-picker-popover";
import { getRandomCoverImage, isStaticCoverImage, uploadCoverImage } from "@/helpers/cover-image.helper";

/**
 * 产品创建/编辑共用的「封面 + logo」头部。
 *
 * 产品的两处表单（弹窗、设置页）都是 useState 而非 react-hook-form，
 * 所以做成纯受控组件；ImagePickerPopover 需要的 RHF control 只服务于
 * 它内部的 Unsplash 搜索框，由本组件自持，不依赖外层表单。
 */

/** 创建表单的默认值：随机 emoji + 随机内置封面，与项目创建的行为一致 */
export const getProductLogoCoverDefaults = (): { logoProps: TLogoProps; coverImageUrl: string } => ({
  logoProps: {
    in_use: "emoji",
    emoji: {
      value: RANDOM_EMOJI_CODES[Math.floor(Math.random() * RANDOM_EMOJI_CODES.length)],
    },
  },
  coverImageUrl: getRandomCoverImage(),
});

/**
 * 创建产品时把表单里的封面 URL 折算成 create payload 字段。
 * 此刻产品还不存在，静态图先以空 entity_identifier 上传成资产，
 * create 接口带上 cover_image_asset 后由后端反向绑定。
 */
export const buildCreateProductCoverPayload = async (
  workspaceSlug: string,
  coverImageUrl: string | null
): Promise<Pick<TCreateProductPayload, "cover_image" | "cover_image_asset">> => {
  if (!coverImageUrl) return {};
  if (isStaticCoverImage(coverImageUrl)) {
    const assetUrl = await uploadCoverImage(coverImageUrl, {
      workspaceSlug,
      entityIdentifier: "",
      entityType: EFileAssetType.PRODUCT_COVER,
    });
    return { cover_image_asset: getAssetIdFromUrl(assetUrl) };
  }
  // Unsplash 等外链直接存文本
  if (/^https?:\/\//i.test(coverImageUrl)) return { cover_image: coverImageUrl };
  // 上传 tab 的产物已是 /api/assets/v2/static/<asset_id>/ 形式的资产 URL
  return { cover_image_asset: getAssetIdFromUrl(coverImageUrl) };
};

type Props = {
  coverImageUrl: string | null;
  logoProps: TLogoProps | undefined;
  editable: boolean;
  /** 上传封面资产用的 entity_identifier：创建流传空串，编辑流传产品 id */
  entityIdentifier: string;
  onCoverChange?: (url: string) => void;
  onLogoChange?: (logoProps: TLogoProps) => void;
  /** 封面容器额外样式；弹窗贴边时用 rounded-t-lg，设置页默认四角圆角 */
  className?: string;
  /** 弹窗用矮封面，设置页保持默认高度 */
  compact?: boolean;
};

export const ProductLogoCoverHeader = (props: Props) => {
  const { coverImageUrl, logoProps, editable, entityIdentifier, onCoverChange, onLogoChange, className, compact } =
    props;
  const { t } = useTranslation();
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const { control } = useForm({ defaultValues: { search: "" } });

  const logoBadge = (
    <span className="grid h-11 w-11 place-items-center rounded-md border border-subtle bg-layer-2 text-secondary">
      {logoProps?.in_use ? <Logo logo={logoProps} size={20} /> : <PackageOpen className="size-5" />}
    </span>
  );

  return (
    <div className={cn("group relative w-full", compact ? "h-[6.75rem]" : "h-44")}>
      <div className={cn("absolute inset-0 overflow-hidden", className ?? "rounded-lg")}>
        <CoverImage
          src={coverImageUrl ?? undefined}
          alt={t("workspace_products.cover_image_alt")}
          showDefaultWhenEmpty
          className="absolute inset-0 h-full w-full"
        />
      </div>
      {editable && (
        <div className="absolute right-2 bottom-2">
          <ImagePickerPopover
            label={t("change_cover")}
            onChange={(url) => onCoverChange?.(url)}
            control={control}
            value={coverImageUrl}
            entityType={EFileAssetType.PRODUCT_COVER}
            entityIdentifier={entityIdentifier}
          />
        </div>
      )}
      <div className={cn("absolute -bottom-[22px]", compact ? "left-6" : "left-3")}>
        {editable ? (
          <EmojiPicker
            iconType="material"
            isOpen={isEmojiPickerOpen}
            handleToggle={(val: boolean) => setIsEmojiPickerOpen(val)}
            className="flex items-center justify-center"
            buttonClassName="flex items-center justify-center"
            label={logoBadge}
            onChange={(val: any) => {
              let logoValue = {};
              if (val?.type === "emoji") logoValue = { value: val.value };
              else if (val?.type === "icon") logoValue = val.value;
              const newLogoProps = { in_use: val?.type, [val?.type]: logoValue } as TLogoProps;
              onLogoChange?.(newLogoProps);
              setIsEmojiPickerOpen(false);
            }}
            defaultIconColor={logoProps?.in_use === "icon" ? logoProps.icon?.color : undefined}
            defaultOpen={logoProps?.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
          />
        ) : (
          logoBadge
        )}
      </div>
    </div>
  );
};
