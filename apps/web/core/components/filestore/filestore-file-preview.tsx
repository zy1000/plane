/**
 * 文件模块里单个文件的预览 —— 「复制链接」发出去的地址看到的就是它。
 *
 * 两个宿主：系统里点到链接时在当前页面弹窗（FilestorePreviewHost），系统外点开是独立
 * 预览页。两处都不带文件模块的界面：顶上一条文件名 + 下载，下面按文件类型给预览
 * （图片 / OnlyOffice 支持的文档 / xmind），其余类型只给下载。高度跟宿主走（h-full）。
 *
 * 能不能看由后端按打开的人自己的权限判，这里只负责把被拒的原因说清楚。下载没有单独的
 * 权限键（PROJECT_ASSET_DOWNLOAD_PERMISSION_KEY 就是「查看文件」），取得到文件信息就能下。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Spin, message } from "antd";
import { X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { FileTypeIcon } from "@/components/asset-explorer/components/file-icon";
import { formatBytes } from "@/components/asset-explorer/utils/format";
import { XmindPreviewContent } from "@/components/filestore/xmind-preview-content";
import { OnlyOfficePreviewContent } from "@/components/onlyoffice/onlyoffice-preview-content";
import { getDownloadErrorMessage } from "@/helpers/network-zone.helper";
import { FilestoreService, type TFilestoreAssetInfo } from "@/services/filestore.service";
import { isImageSupported, isOnlyOfficeSupported, isXmindSupported } from "@/utils/onlyoffice";

type TFilestoreFilePreviewProps = {
  workspaceSlug: string;
  projectId: string;
  assetId: string;
  /** 弹窗里才有：给了就在顶栏出关闭按钮。独立预览页不传 */
  onClose?: () => void;
};

type TPreviewKind = "image" | "office" | "xmind" | "denied" | "unsupported";

const HEADER_HEIGHT = 48;

/** 大网 / 小网隔离下受限的文件只有图片还能看，与文件模块里点「预览」的口径一致 */
const previewKindOf = (asset: TFilestoreAssetInfo): TPreviewKind => {
  if (isImageSupported(asset.name)) return "image";
  if (!asset.can_download) return "denied";
  if (isXmindSupported(asset.name)) return "xmind";
  if (isOnlyOfficeSupported(asset.name)) return "office";
  return "unsupported";
};

const loadErrorText = (status?: number) => {
  if (status === 404) return "文件不存在或已被删除";
  if (status === 403) return "没有查看此文件的权限";
  return "文件加载失败，请稍后重试";
};

const CenteredNotice = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">{children}</div>
);

export const FilestoreFilePreview = ({ workspaceSlug, projectId, assetId, onClose }: TFilestoreFilePreviewProps) => {
  const { t } = useTranslation();
  const service = useMemo(() => new FilestoreService(), []);
  const [asset, setAsset] = useState<TFilestoreAssetInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [imageSrc, setImageSrc] = useState("");

  const kind = asset ? previewKindOf(asset) : null;

  useEffect(() => {
    let cancelled = false;
    setAsset(null);
    setLoadError("");
    service
      .getFilestoreAsset(workspaceSlug, projectId, assetId)
      .then((res) => {
        if (!cancelled) setAsset(res);
      })
      .catch((error: { status?: number }) => {
        if (!cancelled) setLoadError(loadErrorText(error?.status));
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, projectId, service, workspaceSlug]);

  useEffect(() => {
    if (kind !== "image") return;
    let cancelled = false;
    setImageSrc("");
    service
      .getFilestoreAssetPresignedURL(workspaceSlug, projectId, assetId, "inline")
      .then((url) => {
        if (cancelled) return;
        if (url) setImageSrc(url);
        else setLoadError(loadErrorText());
      })
      .catch(() => {
        if (!cancelled) setLoadError(loadErrorText());
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, kind, projectId, service, workspaceSlug]);

  useEffect(() => {
    // 弹窗里不动标签页标题：那是宿主页面的
    if (!onClose && asset?.name) document.title = `预览：${asset.name}`;
  }, [asset?.name, onClose]);

  const handleDownload = useCallback(async () => {
    try {
      const url = await service.getFilestoreAssetPresignedURL(workspaceSlug, projectId, assetId, "attachment");
      if (!url) throw new Error("下载失败");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      message.error(getDownloadErrorMessage(error, "下载失败"));
    }
  }, [assetId, projectId, service, workspaceSlug]);

  const downloadDisabledReason = asset && !asset.can_download ? t("network_zone.download_denied") : undefined;
  const downloadButton = (type: "default" | "primary") => (
    <Button
      type={type}
      size={type === "primary" ? "middle" : "small"}
      disabled={Boolean(downloadDisabledReason)}
      title={downloadDisabledReason}
      onClick={() => void handleDownload()}
    >
      下载
    </Button>
  );

  const renderBody = () => {
    if (loadError) {
      return (
        <CenteredNotice>
          <p className="text-14 text-secondary">{loadError}</p>
        </CenteredNotice>
      );
    }
    if (!asset || !kind) {
      return (
        <CenteredNotice>
          <Spin />
        </CenteredNotice>
      );
    }
    if (kind === "office") {
      return (
        <OnlyOfficePreviewContent
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          assetId={assetId}
          style={{ height: `calc(100vh - ${HEADER_HEIGHT}px)` }}
        />
      );
    }
    if (kind === "xmind") {
      return (
        <XmindPreviewContent
          asset={{ id: asset.id, name: asset.name }}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          ready
        />
      );
    }
    if (kind === "image") {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-2 p-4">
          {imageSrc ? <img src={imageSrc} alt={asset.name} className="max-h-full max-w-full object-contain" /> : <Spin />}
        </div>
      );
    }
    return (
      <CenteredNotice>
        <FileTypeIcon filename={asset.name} size="lg" />
        <p className="max-w-full truncate text-16 font-medium text-primary">{asset.name}</p>
        <p className="text-13 text-tertiary">
          {kind === "denied" ? t("network_zone.view_denied") : "此类型的文件不支持在线预览，请下载后查看"}
        </p>
        {kind === "unsupported" && downloadButton("primary")}
      </CenteredNotice>
    );
  };

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <header
        className="flex shrink-0 items-center gap-3 border-b border-subtle px-4"
        style={{ height: HEADER_HEIGHT }}
      >
        {asset && <FileTypeIcon filename={asset.name} size="sm" />}
        <span className="min-w-0 flex-1 truncate text-14 font-medium text-primary">{asset?.name ?? "文件预览"}</span>
        {asset && <span className="shrink-0 text-12 text-tertiary">{formatBytes(asset.size)}</span>}
        {asset && downloadButton("default")}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
            className="grid size-7 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
          >
            <X className="size-4" />
          </button>
        )}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">{renderBody()}</div>
    </div>
  );
};
