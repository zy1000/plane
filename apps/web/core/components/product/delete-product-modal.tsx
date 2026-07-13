import { Controller, useForm } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import type { TWorkspaceProduct } from "@/services/product.service";

type Props = {
  isOpen: boolean;
  product: TWorkspaceProduct;
  isDeleting: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
};

export function DeleteProductModal(props: Props) {
  const { isDeleting, isOpen, onClose, onDelete, product } = props;
  const { control, handleSubmit, reset, watch } = useForm({ defaultValues: { productName: "" } });
  const canDelete = watch("productName") === product.name;

  const handleClose = () => {
    reset({ productName: "" });
    onClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <form
        onSubmit={handleSubmit(async () => {
          if (canDelete) await onDelete();
        })}
        className="flex flex-col gap-5 p-6"
      >
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-full bg-danger-subtle">
            <AlertTriangle className="size-5 text-danger-primary" />
          </span>
          <div>
            <h2 className="text-18 font-semibold text-primary">删除产品</h2>
            <p className="mt-1 text-12 text-secondary">此操作无法撤销。</p>
          </div>
        </div>
        <p className="text-13 leading-6 text-secondary">
          删除 <span className="font-semibold text-primary">{product.name}</span> 后，关联的产品成员、需求模块、需求、
          需求关联记录和产品描述资产也会被软删除。
        </p>
        <div>
          <p className="mb-2 text-13 text-secondary">
            请输入产品名称 <span className="font-medium text-primary">{product.name}</span> 以确认：
          </p>
          <Controller
            name="productName"
            control={control}
            render={({ field }) => (
              <Input {...field} autoComplete="off" placeholder="输入产品名称" className="w-full" />
            )}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="lg" onClick={handleClose}>
            取消
          </Button>
          <Button type="submit" variant="error-fill" size="lg" disabled={!canDelete} loading={isDeleting}>
            删除产品
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
