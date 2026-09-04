"use client";

import { useState } from "react";
import { PackageOpen } from "lucide-react";
import { RANDOM_EMOJI_CODES } from "@plane/constants";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import type { TLogoProps } from "@plane/types";
import { cn } from "@plane/utils";

/**
 * 产品 logo 选择器，创建/编辑弹窗与设置页共用。
 *
 * 产品的两处表单都是 useState 而非 react-hook-form，所以做成纯受控组件。
 */

/** 创建表单的默认 logo：随机 emoji，与项目创建的行为一致 */
export const getProductLogoDefaults = (): { logoProps: TLogoProps } => ({
  logoProps: {
    in_use: "emoji",
    emoji: {
      value: RANDOM_EMOJI_CODES[Math.floor(Math.random() * RANDOM_EMOJI_CODES.length)],
    },
  },
});

type Props = {
  logoProps: TLogoProps | undefined;
  editable: boolean;
  onLogoChange?: (logoProps: TLogoProps) => void;
  /** 覆盖 logo 块的尺寸 / 底色（弹窗身份区用 64px 的大块） */
  tileClassName?: string;
  logoSize?: number;
};

export const ProductLogoHeader = (props: Props) => {
  const { logoProps, editable, onLogoChange, tileClassName, logoSize = 20 } = props;
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  // 老产品可能没有 logo：用 PackageOpen 兜底
  const logoBadge = (
    <span
      className={cn(
        "grid h-11 w-11 place-items-center rounded-md border border-subtle bg-layer-2 text-secondary",
        tileClassName
      )}
    >
      {logoProps?.in_use ? <Logo logo={logoProps} size={logoSize} /> : <PackageOpen className="size-5" />}
    </span>
  );

  if (!editable) return logoBadge;

  return (
    <EmojiPicker
      iconType="material"
      isOpen={isEmojiPickerOpen}
      handleToggle={(val: boolean) => setIsEmojiPickerOpen(val)}
      className="flex shrink-0 items-center justify-center"
      buttonClassName="flex items-center justify-center"
      label={logoBadge}
      onChange={(val: any) => {
        let logoValue = {};
        if (val?.type === "emoji") logoValue = { value: val.value };
        else if (val?.type === "icon") logoValue = val.value;
        onLogoChange?.({ in_use: val?.type, [val?.type]: logoValue } as TLogoProps);
        setIsEmojiPickerOpen(false);
      }}
      defaultIconColor={logoProps?.in_use === "icon" ? logoProps.icon?.color : undefined}
      defaultOpen={logoProps?.in_use === "emoji" ? EmojiIconPickerTypes.EMOJI : EmojiIconPickerTypes.ICON}
    />
  );
};
