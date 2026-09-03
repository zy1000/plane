"""简道云（经公司网关）客户端。只依赖 requests 与 base，不 import 模型。

POST {JIANDAOYUN_API_BASE_URL}/v5/app/entry/data/list
headers: Authorization: Bearer <JIANDAOYUN_API_TOKEN>; appkey: <JIANDAOYUN_APP_KEY>
body:    {"app_id", "entry_id", "fields": [...], "limit", "data_id"?}   —— data_id 是上一页最后一条的 _id（游标分页）
返回:    {"data": [{"_id": ..., "<field>": ...}, ...]}；出错时 {"code": ..., "msg": ...}
"""

import time

import requests
from django.conf import settings

from .base import IntegrationError

ENTRY_DATA_LIST_PATH = "/v5/app/entry/data/list"
# 请求时给网关的每页条数（网关放宽了官方上限）
PAGE_LIMIT = 10000
# 终止判断用：简道云官方单页上限 100，一页不足 100 条必是最后一页，与网关实际上限无关。
# 不能按 PAGE_LIMIT 判 —— 网关若把 limit 静默钳到 100，会停在第一页丢数据
OFFICIAL_PAGE_CAP = 100
MAX_PAGES = 50
TOTAL_TIME_BUDGET_SECONDS = 90
CONNECT_TIMEOUT_SECONDS = 5


def _headers():
    return {
        "Authorization": f"Bearer {settings.JIANDAOYUN_API_TOKEN}",
        "appkey": settings.JIANDAOYUN_APP_KEY,
    }


def _post(path, body):
    url = settings.JIANDAOYUN_API_BASE_URL.rstrip("/") + path
    try:
        response = requests.post(
            url,
            json=body,
            headers=_headers(),
            timeout=(CONNECT_TIMEOUT_SECONDS, settings.JIANDAOYUN_TIMEOUT_SECONDS),
        )
    except requests.RequestException as exc:
        # str(exc) 只含 URL 不含 header，不会带出 token
        raise IntegrationError("INTEGRATION_REMOTE_UNREACHABLE", str(exc)) from exc
    if response.status_code in (401, 403):
        # 不透传上游 401：前端会当成本站会话过期
        raise IntegrationError("INTEGRATION_REMOTE_UNAUTHORIZED", f"upstream {response.status_code}")
    if not 200 <= response.status_code < 300:
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE", f"upstream {response.status_code}: {response.text[:200]}"
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise IntegrationError("INTEGRATION_REMOTE_BAD_RESPONSE", "non-JSON body") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        # 简道云的错误体是 {"code": .., "msg": ..}，带出来便于排查
        code = payload.get("code") if isinstance(payload, dict) else None
        msg = payload.get("msg") if isinstance(payload, dict) else None
        raise IntegrationError("INTEGRATION_REMOTE_BAD_RESPONSE", f"missing data list (code={code}, msg={msg})")
    return payload


def fetch_entry_field_values(app_id, entry_id, field):
    """按 data_id 游标翻页拉某表单某字段的全部值。

    返回 (原始值列表, 页数)：列表保持远端顺序、不做清洗（含 None / 空串 / 重复），归一化交给调用方。
    """
    values, data_id, seen_ids = [], None, set()
    started = time.monotonic()
    for page in range(1, MAX_PAGES + 1):
        if time.monotonic() - started > TOTAL_TIME_BUDGET_SECONDS:
            raise IntegrationError(
                "INTEGRATION_REMOTE_UNREACHABLE", f"time budget of {TOTAL_TIME_BUDGET_SECONDS}s exceeded"
            )
        body = {"app_id": app_id, "entry_id": entry_id, "fields": [field], "limit": PAGE_LIMIT}
        if data_id:
            body["data_id"] = data_id
        rows = _post(ENTRY_DATA_LIST_PATH, body)["data"]
        if not rows:
            break
        values.extend(row.get(field) if isinstance(row, dict) else None for row in rows)
        if len(rows) < OFFICIAL_PAGE_CAP:
            break
        last_id = rows[-1].get("_id") if isinstance(rows[-1], dict) else None
        if not last_id or last_id in seen_ids:
            # 游标不前进：网关不支持 data_id 或数据异常，宁可停下也不要死循环
            break
        seen_ids.add(last_id)
        data_id = last_id
    else:
        raise IntegrationError("INTEGRATION_REMOTE_BAD_RESPONSE", f"exceeded {MAX_PAGES} pages")
    return values, page
