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

- `CORS_ALLOWED_ORIGINS`（对外地址，唯一必填的地址项）
- `SECRET_KEY`
- `LIVE_SERVER_SECRET_KEY`
- `POSTGRES_PASSWORD`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

对外地址只填 `CORS_ALLOWED_ORIGINS` 一项，服务器有几个对外地址就写几个，逗号分隔，非 80 端口要带端口。例如大网 / 小网双地址：

```env
CORS_ALLOWED_ORIGINS="http://10.32.232.104,http://192.168.100.104"
```

说明：

- 前端镜像不含地址（同源相对路径），同一套镜像所有地址通用，换地址不用重新构建。
- 第一个地址作默认地址（定时提醒等没有访问地址可看时用）；登录等跳转回到用户实际访问的那个地址，不在清单里的地址一律不认。
- 邮件链接按收件人所属网段选地址，大网 / 小网按 IP 自动认；用域名（看不出网段）时另填 `NETWORK_ZONE_WAN_WEB_URL` / `NETWORK_ZONE_LAN_WEB_URL`。
- `WEB_URL`、`APP_BASE_URL`、`ADMIN_BASE_URL`、`SPACE_BASE_URL`、`LIVE_BASE_URL`、`VITE_WEBSITE_URL`、`DOCS_BASE_URL` 留空即可，旧 `.env` 里有就删掉。
- 除非有意修改代理路由，否则保持 `ADMIN_BASE_PATH="/god-mode"`、`SPACE_BASE_PATH="/spaces"`、`LIVE_BASE_PATH="/live"`。
- 使用内置 MinIO 时保持 `AWS_S3_ENDPOINT_URL="http://plane-minio:9000"`。
- OnlyOffice 随 compose 一起启动，经代理挂在 `/onlyoffice/` 下，`ONLYOFFICE_*_URL` 保持默认即可。

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

镜像不含部署地址，迁移到其他服务器时无需改源码，也无需因地址不同重新构建。

### 按 IP/域名一键改 `.env`

在**仓库根目录**执行，可传多个地址（第一个作默认地址）：

```bash
./scripts/build-for-host.sh --no-build 10.32.232.104 192.168.100.104
```

脚本会把这些地址写入根目录 `.env` 的 `CORS_ALLOWED_ORIGINS`，并删掉旧版脚本写过的 `WEB_URL`、`*_BASE_URL`、`VITE_WEBSITE_URL`、`DOCS_BASE_URL`。不加 `--no-build` 时会顺带构建（默认 `web api`，`--services` 指定、`--all` 全量）。HTTPS 示例：`./scripts/build-for-host.sh --https plane.example.com`。容器已在运行时，改完地址执行 `docker compose up -d --force-recreate api worker beat-worker live` 生效。

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

- 将 `CORS_ALLOWED_ORIGINS` 改为最终域名
- 域名看不出大网 / 小网时，按需填 `NETWORK_ZONE_WAN_WEB_URL` / `NETWORK_ZONE_LAN_WEB_URL`
- 按需设置 `SITE_ADDRESS` 及与证书相关的代理变量

该迁移通常不需要改代码。
