import { useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { useProductsContext } from "./context";

export function DeleteProductModal({ onDeleted }: { onDeleted?: () => void } = {}) {
  const { t } = useTranslation();
  const { productToDelete, setProductToDelete, deleteProduct } = useProductsContext();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClose = () => {
    if (isDeleting) return;
    setProductToDelete(null);
  };

  const handleDelete = async () => {
    if (!productToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProduct(productToDelete.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_products.toast.deleted"),
      });
      setProductToDelete(null);
      onDeleted?.();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("workspace_products.toast.failed"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={Boolean(productToDelete)}
      handleClose={handleClose}
      handleSubmit={() => void handleDelete()}
      isSubmitting={isDeleting}
      title={t("workspace_products.delete.title")}
      content={t("workspace_products.delete.description", { name: productToDelete?.name ?? "" })}
      primaryButtonText={{
        default: t("workspace_products.actions.delete"),
        loading: t("workspace_products.delete.deleting"),
      }}
      secondaryButtonText={t("cancel")}
    />
  );
}
