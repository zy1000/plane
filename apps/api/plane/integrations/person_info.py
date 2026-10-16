"""主数据平台（MDM）人员名单 → 本系统账号 / 部门 / 上级 / 工作区成员。只手动触发，不进定时任务。

远端一行：{ename 姓名, orgeh3txt 三级组织, orgeh4txt 四级组织（可空）, pernr 工号（唯一）,
          ad_account 域账号, email 邮箱, person_incharge 上级工号}

规则（2026-10-16 与用户确认）：
- 匹配已有账号：工号 → 邮箱；都没匹配到且邮箱非空则新建账号（随机密码 + is_password_autoset，首次用域密码走 LDAP 登录）
- 已有账号的 display_name / email 不动；工号 / 域账号 / 组织 / 上级按远端覆盖（远端为空的不清本地）
- 部门两层按 (parent, name) 找或建，只增不删
- 上级按 person_incharge 找工号：先本次名单，再本地库；找不到留空并计数
- 本次名单里的人加入触发同步的工作区（Member）；已有成员记录（含停用 / 软删）的不动；远端消失的人不删不停用
"""

import uuid

import requests
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from plane.db.models import Department, Profile, User, UserExtraInfo, WorkspaceMember
from plane.utils.cache import invalidate_cache_directly

from .base import DIRECTION_PULL, IntegrationError, IntegrationSpec

REQUIRED_SETTINGS = ("PERSON_INFO_API_URL", "PERSON_INFO_APP_KEY")
CONNECT_TIMEOUT_SECONDS = 5
READ_TIMEOUT_SECONDS = 60
WORKSPACE_MEMBER_ROLE = 15  # Member
EMPLOYEE_ID_MAX_LENGTH = UserExtraInfo._meta.get_field("employee_id").max_length


# ---- 远端 ----


def fetch_person_rows():
    """GET 人员接口，返回 rows 列表。认证只有请求头 appkey。"""
    try:
        response = requests.get(
            settings.PERSON_INFO_API_URL,
            headers={"appkey": settings.PERSON_INFO_APP_KEY},
            timeout=(CONNECT_TIMEOUT_SECONDS, READ_TIMEOUT_SECONDS),
        )
    except requests.RequestException as exc:
        # str(exc) 只含 URL 不含 header，不会带出 appkey
        raise IntegrationError("INTEGRATION_REMOTE_UNREACHABLE", str(exc)) from exc
    if response.status_code in (401, 403):
        raise IntegrationError("INTEGRATION_REMOTE_UNAUTHORIZED", f"upstream {response.status_code}")
    if not 200 <= response.status_code < 300:
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE", f"upstream {response.status_code}: {response.text[:200]}"
        )
    try:
        payload = response.json()
    except ValueError as exc:
        raise IntegrationError("INTEGRATION_REMOTE_BAD_RESPONSE", "non-JSON body") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("rows"), list):
        raise IntegrationError("INTEGRATION_REMOTE_BAD_RESPONSE", "missing rows list")
    if payload.get("state") is False or (payload.get("errcode") not in (None, 0, "0")):
        raise IntegrationError(
            "INTEGRATION_REMOTE_BAD_RESPONSE",
            f"state={payload.get('state')} errcode={payload.get('errcode')} errmsg={payload.get('errmsg')}",
        )
    return payload["rows"]


def _clean(value):
    if value is None:
        return ""
    return str(value).strip()


def _clean_email(value):
    email = _clean(value).lower()
    if not email:
        return ""
    try:
        validate_email(email)
    except ValidationError:
        return ""
    return email


def normalize_rows(rows):
    """按工号去重；返回 {pernr: person}、无工号条数、重复工号条数。"""
    people = {}
    skipped_no_pernr = 0
    skipped_duplicate = 0
    for raw in rows:
        if not isinstance(raw, dict):
            skipped_no_pernr += 1
            continue
        pernr = _clean(raw.get("pernr"))
        if not pernr or len(pernr) > EMPLOYEE_ID_MAX_LENGTH:
            skipped_no_pernr += 1
            continue
        if pernr in people:
            skipped_duplicate += 1
            continue
        people[pernr] = {
            "pernr": pernr,
            "name": _clean(raw.get("ename")),
            "email": _clean_email(raw.get("email")),
            "ad_account": _clean(raw.get("ad_account")),
            "org3": _clean(raw.get("orgeh3txt")),
            "org4": _clean(raw.get("orgeh4txt")),
            "leader_pernr": _clean(raw.get("person_incharge")),
        }
    return people, skipped_no_pernr, skipped_duplicate


# ---- 本地写入（都在调用方的事务里） ----


def _ensure_departments(people):
    """返回 {pernr: Department | None} 与新建数。三级为空、四级有值时把四级当顶层。"""
    top = {d.name: d for d in Department.objects.filter(parent__isnull=True)}
    sub = {(d.parent_id, d.name): d for d in Department.objects.filter(parent__isnull=False)}
    created = 0
    result = {}
    for pernr, person in people.items():
        org3, org4 = person["org3"], person["org4"]
        if not org3:
            org3, org4 = org4, ""
        if not org3:
            result[pernr] = None
            continue
        parent = top.get(org3)
        if parent is None:
            parent = Department.objects.create(name=org3)
            top[org3] = parent
            created += 1
        if not org4:
            result[pernr] = parent
            continue
        node = sub.get((parent.id, org4))
        if node is None:
            node = Department.objects.create(name=org4, parent=parent)
            sub[(parent.id, org4)] = node
            created += 1
        result[pernr] = node
    return result, created


def _create_user(person, password_hash):
    user = User(
        email=person["email"],
        username=uuid.uuid4().hex,
        display_name=person["name"],
        first_name=person["name"],
        is_password_autoset=True,
        is_email_verified=True,
        # 随机密码从不使用（登录走 LDAP 域密码）；哈希一次 0.27s，几百人逐个 set_password 要两分钟，所以整批复用一个哈希
        password=password_hash,
    )
    user.save()
    Profile.objects.create(user=user)
    return user


def _match_or_create_users(people):
    """返回 {pernr: User} 与计数。一个本地账号只认领一次：第二行映射到同一账号按重复跳过。"""
    by_pernr = {
        extra.employee_id: extra.user
        for extra in UserExtraInfo.objects.filter(employee_id__in=list(people)).select_related("user")
    }
    emails = [person["email"] for person in people.values() if person["email"]]
    by_email = {user.email: user for user in User.objects.filter(email__in=emails)}
    users = {}
    claimed = set()
    counts = {"users_created": 0, "users_matched": 0, "skipped_no_email": 0, "skipped_duplicate": 0}
    password_hash = make_password(uuid.uuid4().hex)
    for pernr, person in people.items():
        user = by_pernr.get(pernr)
        if user is None and person["email"]:
            user = by_email.get(person["email"])
        if user is not None and user.id in claimed:
            counts["skipped_duplicate"] += 1
            continue
        if user is None:
            if not person["email"]:
                counts["skipped_no_email"] += 1
                continue
            user = _create_user(person, password_hash)
            by_email[user.email] = user
            counts["users_created"] += 1
        else:
            counts["users_matched"] += 1
        claimed.add(user.id)
        users[pernr] = user
    return users, counts


def _resolve_leaders(people, users):
    """{pernr: leader User | None} 与未解析数。本次名单里没有的上级再查本地库。"""
    wanted = {person["leader_pernr"] for person in people.values() if person["leader_pernr"]}
    missing = [pernr for pernr in wanted if pernr not in users]
    local = {}
    if missing:
        local = {
            extra.employee_id: extra.user
            for extra in UserExtraInfo.objects.filter(employee_id__in=missing).select_related("user")
        }
    leaders = {}
    unresolved = 0
    for pernr, person in people.items():
        leader_pernr = person["leader_pernr"]
        if not leader_pernr:
            leaders[pernr] = None
            continue
        leader = users.get(leader_pernr) or local.get(leader_pernr)
        if leader is None:
            unresolved += 1
        leaders[pernr] = leader
    return leaders, unresolved


def _write_extra_info(people, users, departments, leaders):
    for pernr, user in users.items():
        person = people[pernr]
        extra, _ = UserExtraInfo.objects.get_or_create(user=user)
        extra.employee_id = pernr
        if person["ad_account"]:
            extra.ad_account = person["ad_account"]
        department = departments.get(pernr)
        if department is not None:
            extra.organization = department
            extra.department = department.path
        leader = leaders.get(pernr)
        if leader is not None and leader.id != user.id:
            extra.leader = leader
        extra.save(update_fields=["employee_id", "ad_account", "organization", "department", "leader"])


def _add_workspace_members(workspace, users):
    """只给没有任何成员记录（含停用 / 软删）的人建 Member；返回新加入数。"""
    user_ids = [user.id for user in users.values()]
    existing = set(
        WorkspaceMember.all_objects.filter(workspace=workspace, member_id__in=user_ids).values_list(
            "member_id", flat=True
        )
    )
    to_add = [
        WorkspaceMember(workspace=workspace, member_id=user_id, role=WORKSPACE_MEMBER_ROLE)
        for user_id in user_ids
        if user_id not in existing
    ]
    if to_add:
        WorkspaceMember.objects.bulk_create(to_add, ignore_conflicts=True)
        invalidate_cache_directly(
            path=f"/api/workspaces/{workspace.slug}/members/", url_params=False, user=False, multiple=True
        )
    return len(to_add)


def sync_person_info(workspace, actor=None):
    # HTTP 在事务之外
    rows = fetch_person_rows()
    people, skipped_no_pernr, skipped_duplicate = normalize_rows(rows)

    with transaction.atomic():
        departments, departments_created = _ensure_departments(people)
        users, counts = _match_or_create_users(people)
        leaders, leaders_unresolved = _resolve_leaders(people, users)
        _write_extra_info(people, users, departments, leaders)
        members_added = _add_workspace_members(workspace, users)

    return {
        "remote_total": len(rows),
        "users_created": counts["users_created"],
        "users_matched": counts["users_matched"],
        "members_added": members_added,
        "departments_created": departments_created,
        "leaders_unresolved": leaders_unresolved,
        "skipped_no_email": counts["skipped_no_email"],
        "skipped_duplicate": skipped_duplicate + counts["skipped_duplicate"] + skipped_no_pernr,
    }


def _describe_target(workspace):
    members = WorkspaceMember.objects.filter(workspace=workspace, is_active=True, member__is_bot=False)
    return {
        "kind": "workspace_members",
        "member_count": members.count(),
        # 带工号的成员数：粗看同步覆盖了多少人
        "synced_count": members.filter(member__extra_info__employee_id__isnull=False)
        .exclude(member__extra_info__employee_id="")
        .count(),
    }


SPEC = IntegrationSpec(
    key="mdm_person_info",
    name="人员信息",
    provider="mdm",
    direction=DIRECTION_PULL,
    description="从主数据平台拉取人员名单：按工号 / 邮箱匹配或新建账号，维护工号、域账号、组织关系与上级，并把名单里的人加入本工作区。只新增，不删除、不停用；仅手动触发。",
    required_settings=REQUIRED_SETTINGS,
    run=sync_person_info,
    describe_target=_describe_target,
    scheduled=False,
)
