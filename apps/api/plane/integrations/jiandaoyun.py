"""简道云（经公司网关）客户端。只依赖 requests 与 base，不 import 模型。

网关**每个接口一个编号**，所以读和写的 base_url 不同：
- 读  POST {JIANDAOYUN_API_BASE_URL}/v5/app/entry/data/list
      body {"app_id", "entry_id", "fields": [...], "limit", "data_id"?, "filter"?}   —— data_id 是上一页最后一条的 _id（游标分页）
      返回 {"data": [{"_id": ..., "<field>": ...}, ...]}
- 写  POST {base_url}/v5/app/entry/data/create  body {"app_id", "entry_id", "data": {widget: {"value": ...}}, "is_start_trigger"}
      POST {base_url}/v5/app/entry/data/update  body 同上 + "data_id"
      POST {base_url}/v5/app/entry/data/delete  body {"app_id", "entry_id", "data_id", "is_start_trigger"}
      create / update 返回 {"data": {...完整记录...}}，delete 返回 {"status": "success"}
headers: Authorization: Bearer <JIANDAOYUN_API_TOKEN>; appkey: <JIANDAOYUN_APP_KEY>
出错时体是 {"code": ..., "msg": ...}（HTTP 400）。
"""

import time

import requests
from django.conf import settings

from .base import IntegrationError

ENTRY_DATA_LIST_PATH = "/v5/app/entry/data/list"
ENTRY_DATA_CREATE_PATH = "/v5/app/entry/data/create"
ENTRY_DATA_UPDATE_PATH = "/v5/app/entry/data/update"
ENTRY_DATA_DELETE_PATH = "/v5/app/entry/data/delete"
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


def _request(path, body, *, base_url=None):
    """发一次请求，返回 JSON 对象。连不上 / 5xx 是 UNREACHABLE（调用方可重试），4xx / 非 JSON 是 BAD_RESPONSE。"""
    url = (base_url or settings.JIANDAOYUN_API_BASE_URL).rstrip("/") + path
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
        raise IntegrationError(
            "INTEGRATION_REMOTE_UNAUTHORIZED", f"upstream {response.status_code}"
        )
    if response.status_code >= 500:
        raise IntegrationError(
            "INTEGRATION_REMOTE_UNREACHABLE",
            f"upstream {response.status_code}: {response.text[:200]}",
        )
    if not 200 <= response.status_code < 300:
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE",
            f"upstream {response.status_code}: {response.text[:200]}",
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE", "non-JSON body"
        ) from exc
    if not isinstance(payload, dict):
        raise IntegrationError("INTEGRATION_REMOTE_BAD_RESPONSE", "non-object body")
    return payload


def _error_summary(payload):
    # 简道云的错误体是 {"code": .., "msg": ..}，带出来便于排查
    return f"code={payload.get('code')}, msg={payload.get('msg')}"


def _post(path, body):
    payload = _request(path, body)
    if not isinstance(payload.get("data"), list):
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE",
            f"missing data list ({_error_summary(payload)})",
        )
    return payload


def fetch_entry_rows(app_id, entry_id, fields, *, filter=None):
    """按 data_id 游标翻页拉某表单的全部行，只带 fields 里的字段（外加 _id）。

    系统字段（createTime / updateTime / creator / updater）要的话也得写进 fields。
    ``filter`` 是简道云的筛选条件 {"rel": "and", "cond": [{"field", "method", "value": [...]}]}，原样透传。
    返回 (行列表, 页数)：保持远端顺序、不做清洗，归一化交给调用方。
    """
    rows, data_id, seen_ids = [], None, set()
    started = time.monotonic()
    for page in range(1, MAX_PAGES + 1):
        if time.monotonic() - started > TOTAL_TIME_BUDGET_SECONDS:
            raise IntegrationError(
                "INTEGRATION_REMOTE_UNREACHABLE",
                f"time budget of {TOTAL_TIME_BUDGET_SECONDS}s exceeded",
            )
        body = {
            "app_id": app_id,
            "entry_id": entry_id,
            "fields": list(fields),
            "limit": PAGE_LIMIT,
        }
        if filter:
            body["filter"] = filter
        if data_id:
            body["data_id"] = data_id
        page_rows = _post(ENTRY_DATA_LIST_PATH, body)["data"]
        if not page_rows:
            break
        rows.extend(row if isinstance(row, dict) else {} for row in page_rows)
        if len(page_rows) < OFFICIAL_PAGE_CAP:
            break
        last_id = rows[-1].get("_id")
        if not last_id or last_id in seen_ids:
            # 游标不前进：网关不支持 data_id 或数据异常，宁可停下也不要死循环
            break
        seen_ids.add(last_id)
        data_id = last_id
    else:
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE", f"exceeded {MAX_PAGES} pages"
        )
    return rows, page


def fetch_entry_field_values(app_id, entry_id, field):
    """拉某表单某字段的全部值。

    返回 (原始值列表, 页数)：列表保持远端顺序、不做清洗（含 None / 空串 / 重复），归一化交给调用方。
    """
    rows, pages = fetch_entry_rows(app_id, entry_id, [field])
    return [row.get(field) for row in rows], pages


# ---- 写 ----------------------------------------------------------------------


def _entry_row(payload, what):
    row = payload.get("data")
    if not isinstance(row, dict) or not row.get("_id"):
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE",
            f"{what} returned no record ({_error_summary(payload)})",
        )
    return row


def create_entry_row(base_url, app_id, entry_id, data, *, is_start_trigger=True):
    """新建一条，返回简道云回的完整记录（含 ``_id``、流水号）。

    ``is_start_trigger`` 让简道云那边的智能助手（含数据推送）照常触发，所以这条会再推回本系统，
    调用方要能认出是自己刚建的。不传 data_creator：本地创建人未必是简道云成员，传了会整条失败。
    """
    body = {
        "app_id": app_id,
        "entry_id": entry_id,
        "data": data,
        "is_start_trigger": is_start_trigger,
    }
    return _entry_row(_request(ENTRY_DATA_CREATE_PATH, body, base_url=base_url), "create")


def update_entry_row(base_url, app_id, entry_id, data_id, data, *, is_start_trigger=True):
    """改一条，只传要改的字段；返回改后的完整记录。"""
    body = {
        "app_id": app_id,
        "entry_id": entry_id,
        "data_id": data_id,
        "data": data,
        "is_start_trigger": is_start_trigger,
    }
    return _entry_row(_request(ENTRY_DATA_UPDATE_PATH, body, base_url=base_url), "update")


def delete_entry_row(base_url, app_id, entry_id, data_id, *, is_start_trigger=True):
    body = {
        "app_id": app_id,
        "entry_id": entry_id,
        "data_id": data_id,
        "is_start_trigger": is_start_trigger,
    }
    payload = _request(ENTRY_DATA_DELETE_PATH, body, base_url=base_url)
    if payload.get("status") != "success":
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE",
            f"delete not confirmed ({_error_summary(payload)})",
        )
