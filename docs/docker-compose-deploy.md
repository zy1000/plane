# Docker Compose 部署

本仓库现在可以在一台全新服务器上，通过单个 `docker compose` 栈完成部署：从源码构建镜像，并在内置反向代理后提供所有 Plane 应用。

## 本部署包含的内容

- `web`：主应用，路径 `/`
- `admin`：God mode，路径 `/god-mode`
- `space`：已发布空间，路径 `/spaces`
- `live`：实时功能，路径 `/live`
- `api`、`worker`、`beat-worker`、`migrator`
- 内置 `postgres`、`redis`、`rabbitmq`、`minio` 与 `proxy`

## 前置条件

- 已安装 Docker Engine 及 Compose 插件
- 完整源码构建建议至少 4 核 CPU / 8 GB 内存
- 目标服务器需有可用端口 `80`
- 仅在你后续启用 HTTPS 时需要可用端口 `443`

## 1. 准备环境文件

复制根目录部署模板：

```bash
cp .env.example .env
```

然后编辑 `.env`，优先核对以下变量：

- `WEB_URL`
- `APP_BASE_URL`
- `ADMIN_BASE_URL`
- `SPACE_BASE_URL`
- `LIVE_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `SECRET_KEY`
- `LIVE_SERVER_SECRET_KEY`
- `POSTGRES_PASSWORD`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

若为单机 HTTP 部署，请将所有 `http://127.0.0.1` 替换为服务器 IP 或域名，例如：

```env
WEB_URL="http://203.0.113.10"
APP_BASE_URL="http://203.0.113.10"
ADMIN_BASE_URL="http://203.0.113.10"
SPACE_BASE_URL="http://203.0.113.10"
LIVE_BASE_URL="http://203.0.113.10"
CORS_ALLOWED_ORIGINS="http://203.0.113.10"
```

说明：

- 除非有意修改代理路由，否则保持 `ADMIN_BASE_PATH="/god-mode"`、`SPACE_BASE_PATH="/spaces"`、`LIVE_BASE_PATH="/live"`。
- 使用内置 MinIO 时保持 `AWS_S3_ENDPOINT_URL="http://plane-minio:9000"`。
- `ONLYOFFICE_DOCUMENT_SERVER_URL` 为可选项；未单独部署 OnlyOffice 时可保持默认。

## 2. 构建镜像

```bash
docker compose build
```

会为以下服务构建源码镜像：

- `api`
- `web`
- `admin`
- `space`
- `live`
- `proxy`

前端构建参数来自根目录同一 `.env`，迁移到其他服务器时无需改源码。

### 多机部署：按 IP/域名一键改 `.env` 并构建前端

前端会把构建时的 `WEB_URL` 等写进静态资源。换一台机器部署时，在**仓库根目录**执行：

```bash
./scripts/build-for-host.sh 10.0.0.5
```

脚本会更新根目录 `.env` 中的 `WEB_URL`、`APP_BASE_URL`、`ADMIN_BASE_URL`、`SPACE_BASE_URL`、`LIVE_BASE_URL`、`CORS_ALLOWED_ORIGINS`、`VITE_WEBSITE_URL`，并执行 `docker compose build web admin space`。域名或 HTTPS 示例：`./scripts/build-for-host.sh --https plane.example.com`。仅改配置不构建：`./scripts/build-for-host.sh --no-build 10.0.0.5`。需全量构建：`./scripts/build-for-host.sh --all 10.0.0.5`。

## 3. 启动栈

```bash
docker compose up -d
```

Compose 已配置为：

- 基础设施服务先就绪
- `migrator` 在 `api` 之前运行
- `worker` 与 `beat-worker` 等待基础设施与迁移完成
- `proxy` 等待 `web`、`admin`、`space`、`api`、`live` 就绪

## 4. 验证部署

查看容器状态：

```bash
docker compose ps
```

然后访问对外入口：

- `http://YOUR_SERVER_IP/`
- `http://YOUR_SERVER_IP/god-mode/`
- `http://YOUR_SERVER_IP/spaces/`
- `http://YOUR_SERVER_IP/live`

常用日志命令：

```bash
docker compose logs -f api
docker compose logs -f web
docker compose logs -f live
docker compose logs -f proxy
```

## 5. 常见调整

### 使用外部服务

若后续将 PostgreSQL、Redis、RabbitMQ 或 S3/MinIO 迁出 Compose，请在 `.env` 中更新对应项：

- `POSTGRES_HOST`、`POSTGRES_PORT`、`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`
- `REDIS_URL` 或 `REDIS_HOST` / `REDIS_PORT`
- `RABBITMQ_HOST`、`RABBITMQ_PORT`、`RABBITMQ_USER`、`RABBITMQ_PASSWORD`、`RABBITMQ_VHOST`
- `AWS_S3_ENDPOINT_URL`、`AWS_S3_BUCKET_NAME`、`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`

### 后续改为域名 + HTTPS

基于域名部署时：

- 将 `*_BASE_URL` 与 `WEB_URL` 改为最终域名
- 更新 `CORS_ALLOWED_ORIGINS`
- 按需设置 `SITE_ADDRESS` 及与证书相关的代理变量

该迁移通常不需要改代码。
