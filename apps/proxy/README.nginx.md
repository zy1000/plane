# Nginx 反代（Caddyfile.ce 的等价 HTTP 版）

本目录除 `Caddyfile.ce` / `Dockerfile.ce` 外，提供 **仅 HTTP（无 TLS）** 的 Nginx 配置，路由与 `Caddyfile.ce` 中 `plane_proxy` 一致。

## 文件说明

| 路径 | 作用 |
|------|------|
| `nginx/conf.d/00-map.conf` | WebSocket 用的 `map $http_upgrade $connection_upgrade`（须放在 `http` 上下文，通过 `conf.d` 加载） |
| `nginx/templates/default.conf.template` | `server` 块；`${FILE_SIZE_LIMIT}`、`${BUCKET_NAME}` 由官方镜像 entrypoint 做 `envsubst` |
| `nginx/proxy_params.plane` | 统一的反代头与超时 |
| `Dockerfile.nginx` | 构建 Nginx 代理镜像 |

## 在 docker-compose 中使用

将 `proxy` 服务改为基于 Nginx 构建，并保留与 Caddy 相同的环境变量（至少 `FILE_SIZE_LIMIT`、`BUCKET_NAME` 与 Caddy 一致）：

```yaml
  proxy:
    container_name: proxy
    build:
      context: ./apps/proxy
      dockerfile: Dockerfile.nginx
    restart: always
    ports:
      - ${LISTEN_HTTP_PORT}:80
    environment:
      FILE_SIZE_LIMIT: ${FILE_SIZE_LIMIT:-104857600}
      BUCKET_NAME: ${AWS_S3_BUCKET_NAME:-uploads}
    depends_on:
      - web
      - api
      - space
      - admin
      - live
      - plane-minio
```

> 若你不在本机暴露 MinIO 或 Live，可按实际栈删减 `depends_on`；路由仍会指向对应服务名。

## 与 Caddy 的差异说明

- **未实现**：`acme_ca`、`CERT_*`、`trusted_proxies`（真实客户端 IP 需在你最外层反代或自行加 `real_ip` 配置）。
- **请求体上限**：`client_max_body_size` 使用 `FILE_SIZE_LIMIT` 字节值，与 Caddy `request_body max_size` 对齐。
- **大请求头**：Caddy 为 25MB；此处用 `large_client_header_buffers 8 64k`，若遇极大 Cookie/头可再调大。
