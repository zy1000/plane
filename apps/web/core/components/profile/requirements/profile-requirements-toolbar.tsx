/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon, CloseIcon, SearchIcon } from "@plane/propel/icons";
import type { TProfileRequirementFacets } from "@plane/types";
import { CustomMenu } from "@plane/ui";

/** 常驻展开的标题搜索框，输入停 300ms 再查 */
export function ProfileRequirementSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [input, setInput] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setInput(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const schedule = (next: string) => {
    setInput(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next.trim()), 300);
  };

  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-placeholder md:w-72">
      <SearchIcon className="size-3.5 shrink-0" />
      <input
        ref={inputRef}
        type="search"
        className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
        placeholder="搜索标题"
        value={input}
        onChange={(event) => schedule(event.target.value)}
      />
      {input && (
        <button type="button" aria-label="清空搜索" className="grid place-items-center" onClick={() => schedule("")}>
          <CloseIcon className="size-3" />
        </button>
      )}
    </label>
  );
}

/** 产品范围下拉：一个人可能负责多个产品的需求，只有一个产品时不显示 */
export function ProfileProductScopeMenu({
  facets,
  selectedProductId,
  onSelect,
}: {
  facets: TProfileRequirementFacets | null;
  selectedProductId: string | null;
  onSelect: (productId: string | null) => void;
}) {
  const { t } = useTranslation();
  const products = facets?.by_product ?? [];
  if (products.length < 2) return null;

  const selected = products.find((product) => product.product_id === selectedProductId);
  const options = [
    { id: null, label: t("profile.stats.requirements.all_products"), count: facets?.total ?? 0 },
    ...products.map((product) => ({
      id: product.product_id,
      label: `${product.identifier} ${product.name}`,
      count: product.count,
    })),
  ];

  return (
    <CustomMenu
      placement="bottom-start"
      maxHeight="lg"
      closeOnSelect
      customButton={
        <span className="flex h-9 max-w-64 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-13 text-primary hover:bg-layer-transparent-hover">
          <span className="truncate">
            {selected ? `${selected.identifier} ${selected.name}` : t("profile.stats.requirements.all_products")}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-tertiary" />
        </span>
      }
    >
      {options.map((option) => (
        <CustomMenu.MenuItem key={option.id ?? "all"} onClick={() => onSelect(option.id)} className="flex items-center gap-2">
          <span className="grid size-3.5 shrink-0 place-items-center">
            {option.id === selectedProductId && <Check className="size-3.5 text-accent-primary" />}
          </span>
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          <span className="shrink-0 text-12 text-tertiary tabular-nums">{option.count}</span>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
}
