import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { NETWORK_CHOICES } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectNetworkIcon } from "@/components/project/project-network-icon";
import { useUser } from "@/hooks/store/user";
import { FileService } from "@/services/file.service";
import type { TProductCreatePayload, TProductNetwork } from "@/services/product.service";
import { ProductDescriptionEditor } from "./product-description-editor";

const fileService = new FileService();

type Props = {
  isOpen: boolean;
  workspaceSlug: string;
  onClose: () => void;
  onSubmit: (data: TProductCreatePayload) => Promise<unknown>;
};

type TProductFormValues = {
  name: string;
  description_html: string;
  network: TProductNetwork;
  owner: string | null;
};

export function CreateProductModal(props: Props) {
  const { isOpen, onClose, onSubmit, workspaceSlug } = props;
  const { data: currentUser } = useUser();
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    reset,
    setError,
    setValue,
  } = useForm<TProductFormValues>({
    defaultValues: {
      name: "",
      description_html: "<p></p>",
      network: 2,
      owner: null,
    },
  });

  useEffect(() => {
    if (isOpen && currentUser?.id) setValue("owner", currentUser.id);
  }, [currentUser?.id, isOpen, setValue]);

  const cleanupTemporaryAssets = async () => {
    if (uploadedAssetIds.length === 0) return;
    await Promise.allSettled(
      uploadedAssetIds.map((assetId) => fileService.deleteWorkspaceAsset(workspaceSlug, assetId))
    );
    setUploadedAssetIds([]);
  };

  const handleClose = async () => {
    await cleanupTemporaryAssets();
    reset({
      name: "",
      description_html: "<p></p>",
      network: 2,
      owner: currentUser?.id ?? null,
    });
    onClose();
  };

  const submitForm = async (data: TProductFormValues) => {
    if (!data.owner) return;
    try {
      await onSubmit({
        ...data,
        owner: data.owner,
        description_asset_ids: uploadedAssetIds,
      });
      setUploadedAssetIds([]);
      reset({
        name: "",
        description_html: "<p></p>",
        network: 2,
        owner: currentUser?.id ?? null,
      });
      onClose();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "创建成功",
        message: "产品已创建并加入产品列表。",
      });
    } catch (error: any) {
      const nameErrors = error?.name;
      if (Array.isArray(nameErrors) && nameErrors.includes("PRODUCT_NAME_ALREADY_EXIST")) {
        setError("name", { message: "当前工作区已存在同名产品" });
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "创建失败",
        message: error?.error ?? "无法创建产品，请稍后重试。",
      });
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => void handleClose()}
      position={EModalPosition.TOP}
      width={EModalWidth.XXXXL}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="text-16 font-semibold text-primary">创建产品</h2>
        <button type="button" onClick={() => void handleClose()} className="rounded p-1.5 hover:bg-layer-1">
          <CloseIcon className="size-4 text-secondary" />
        </button>
      </div>

      <form onSubmit={handleSubmit(submitForm)} className="px-3">
        <div className="mt-6 space-y-6 pb-5">
          <div className="grid grid-cols-1 gap-x-2 gap-y-3">
            <div>
              <Controller
                name="name"
                control={control}
                rules={{
                  required: "请输入产品名称",
                  maxLength: { value: 255, message: "产品名称不能超过 255 个字符" },
                }}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="product-name"
                    autoFocus
                    hasError={!!errors.name}
                    placeholder="产品名称"
                    className="focus:border-blue-400 h-[38px] min-h-[38px] w-full !py-0 text-13 leading-5"
                  />
                )}
              />
              {errors.name?.message && <span className="text-11 text-danger-primary">{errors.name.message}</span>}
            </div>

            <div>
              <Controller
                name="description_html"
                control={control}
                render={({ field }) => (
                  <ProductDescriptionEditor
                    workspaceSlug={workspaceSlug}
                    value={field.value}
                    editable
                    placeholder="描述"
                    onChange={field.onChange}
                    onAssetUpload={(assetId) =>
                      setUploadedAssetIds((current) => (current.includes(assetId) ? current : [...current, assetId]))
                    }
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Controller
              name="network"
              control={control}
              render={({ field }) => {
                const currentNetwork = NETWORK_CHOICES.find((choice) => choice.key === field.value);
                return (
                  <div className="h-7 flex-shrink-0">
                    <CustomSelect
                      value={field.value}
                      onChange={field.onChange}
                      label={
                        <div className="flex h-full items-center gap-1">
                          {currentNetwork ? (
                            <>
                              <ProjectNetworkIcon iconKey={currentNetwork.iconKey} />
                              {currentNetwork.key === 2 ? "公开" : "私密"}
                            </>
                          ) : (
                            <span className="text-placeholder">选择访问级别</span>
                          )}
                        </div>
                      }
                      placement="bottom-start"
                      className="h-full"
                      buttonClassName="h-full"
                      noChevron
                    >
                      {NETWORK_CHOICES.map((choice) => (
                        <CustomSelect.Option key={choice.key} value={choice.key}>
                          <div className="flex items-start gap-2">
                            <ProjectNetworkIcon iconKey={choice.iconKey} className="h-3.5 w-3.5" />
                            <div className="-mt-1">
                              <p>{choice.key === 2 ? "公开" : "私密"}</p>
                              <p className="text-11 text-placeholder">
                                {choice.key === 2 ? "工作区成员可以发现该产品" : "仅产品成员可以访问"}
                              </p>
                            </div>
                          </div>
                        </CustomSelect.Option>
                      ))}
                    </CustomSelect>
                  </div>
                );
              }}
            />

            <Controller
              name="owner"
              control={control}
              rules={{ required: "请选择产品负责人" }}
              render={({ field }) => (
                <div className="relative h-7 flex-shrink-0">
                  <MemberDropdown
                    value={field.value}
                    onChange={field.onChange}
                    multiple={false}
                    placeholder="负责人"
                    buttonVariant="border-with-text"
                    buttonClassName={cn("text-11", errors.owner?.message && "border-danger-strong")}
                  />
                  {errors.owner?.message && (
                    <span className="absolute left-0 top-full z-10 mt-0.5 whitespace-nowrap text-caption-sm-medium text-danger-primary">
                      {errors.owner.message}
                    </span>
                  )}
                </div>
              )}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-subtle py-4">
          <Button type="button" variant="secondary" size="lg" onClick={() => void handleClose()}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
            {isSubmitting ? "创建中" : "创建产品"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
