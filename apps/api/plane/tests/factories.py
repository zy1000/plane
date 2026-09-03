# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import factory
from uuid import uuid4
from django.utils import timezone

from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember


class UserFactory(factory.django.DjangoModelFactory):
    """Factory for creating User instances"""

    class Meta:
        model = User
        django_get_or_create = ("email",)

    id = factory.LazyFunction(uuid4)
    email = factory.Sequence(lambda n: f"user{n}@plane.so")
    password = factory.PostGenerationMethodCall("set_password", "password")
    first_name = factory.Sequence(lambda n: f"First{n}")
    last_name = factory.Sequence(lambda n: f"Last{n}")
    is_active = True
    is_superuser = False
    is_staff = False


class WorkspaceFactory(factory.django.DjangoModelFactory):
    """Factory for creating Workspace instances"""

    class Meta:
        model = Workspace
        django_get_or_create = ("slug",)

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Workspace {n}")
    slug = factory.Sequence(lambda n: f"workspace-{n}")
    owner = factory.SubFactory(UserFactory)
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class WorkspaceMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating WorkspaceMember instances"""

    class Meta:
        model = WorkspaceMember

    id = factory.LazyFunction(uuid4)
    workspace = factory.SubFactory(WorkspaceFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectFactory(factory.django.DjangoModelFactory):
    """Factory for creating Project instances"""

    class Meta:
        model = Project
        django_get_or_create = ("name", "workspace")

    id = factory.LazyFunction(uuid4)
    name = factory.Sequence(lambda n: f"Project {n}")
    workspace = factory.SubFactory(WorkspaceFactory)
    created_by = factory.SelfAttribute("workspace.owner")
    updated_by = factory.SelfAttribute("workspace.owner")
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


class ProjectMemberFactory(factory.django.DjangoModelFactory):
    """Factory for creating ProjectMember instances"""

    class Meta:
        model = ProjectMember

    id = factory.LazyFunction(uuid4)
    project = factory.SubFactory(ProjectFactory)
    member = factory.SubFactory(UserFactory)
    role = 20  # Admin role by default
    created_at = factory.LazyFunction(timezone.now)
    updated_at = factory.LazyFunction(timezone.now)


def _dictionary_payload(workspace, field_keys, skip=()):
    """按 字段 -> 系统字典 key 的映射，给每个字段取字典的首个值（没有预置值的临时建一条）。

    pytest 跑 --nomigrations，0346 / 0348 的 seed 不会执行，所以这里显式 ensure。
    """
    from plane.db.models import DataDictionary, DataDictionaryItem
    from plane.utils.data_dictionary import ensure_system_dictionaries

    ensure_system_dictionaries(workspace)
    payload = {}
    for field, key in field_keys.items():
        if field in skip:
            continue
        dictionary = DataDictionary.objects.get(workspace=workspace, key=key)
        item = dictionary.items.first() or DataDictionaryItem.objects.create(
            dictionary=dictionary, label=f"{key} default"
        )
        payload[field] = str(item.id)
    return payload


def product_required_payload(workspace, lead):
    """Product POST 新增的必填字段（不含 code：代号工作区内唯一，由调用方给）。"""
    from plane.utils.data_dictionary import PRODUCT_DICTIONARY_FIELD_KEYS

    payload = {
        "start_date": "2026-01-01",
        "project_lead": str(lead.id),
        "test_lead": str(lead.id),
    }
    payload.update(_dictionary_payload(workspace, PRODUCT_DICTIONARY_FIELD_KEYS))
    return payload


def project_code_label(workspace, label=None):
    """把代号写进 project_code 系统字典并返回 label：0355 之后代号必须来自字典（--nomigrations，显式 ensure）。"""
    from plane.db.models import DataDictionary, DataDictionaryItem
    from plane.utils.data_dictionary import PROJECT_CODE_DICTIONARY_KEY, ensure_system_dictionaries

    ensure_system_dictionaries(workspace)
    label = (label or f"C-{uuid4().hex[:8]}").strip()
    dictionary = DataDictionary.objects.get(workspace=workspace, key=PROJECT_CODE_DICTIONARY_KEY)
    DataDictionaryItem.objects.get_or_create(dictionary=dictionary, label=label)
    return label


def project_required_payload(workspace, lead):
    """Project POST（0348 之后）新增的必填字段。

    不含 code（代号工作区内唯一，由调用方给）与 business_unit（选填）。
    """
    from plane.utils.data_dictionary import PROJECT_DICTIONARY_FIELD_KEYS

    payload = {
        "product_manager": str(lead.id),
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
    }
    payload.update(
        _dictionary_payload(workspace, PROJECT_DICTIONARY_FIELD_KEYS, skip=("business_unit",))
    )
    return payload
