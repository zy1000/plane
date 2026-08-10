from unittest.mock import patch
from uuid import uuid4

import pytest
from django.core.exceptions import ValidationError
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from plane.db.models import (
    Product,
    ProductMember,
    ProductMemberRole,
    ProductRole,
    WorkspaceMember,
)
from plane.license.models import Instance, InstanceAdmin
from plane.tests.factories import UserFactory, WorkspaceFactory


@pytest.mark.contract
@pytest.mark.django_db
class TestProductApp:
    def setup_method(self):
        self.owner = UserFactory(username=f"product-owner-{uuid4()}")
        self.workspace = WorkspaceFactory(owner=self.owner)
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.owner,
            role=20,
        )
        self.list_url = reverse("products", kwargs={"slug": self.workspace.slug})

    def authenticate(self, api_client, user):
        api_client.force_authenticate(user=user)

    def add_member(self, role):
        user = UserFactory(username=f"product-member-{uuid4()}")
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=user,
            role=role,
        )
        return user

    def test_product_crud_contract_and_writable_owner_and_network(self, api_client):
        reviewer = self.add_member(role=15)
        self.authenticate(api_client, self.owner)

        create_response = api_client.post(
            self.list_url,
            {
                "name": "  Launchpad  ",
                # 小写 + 空白：标识必须在查重之前就被归一化成 "LP"
                "identifier": "  lp  ",
                "description_html": '<p>Hello</p><script>alert("x")</script>',
                "network": 0,
                "owner": str(reviewer.id),
                "reviewers": [str(reviewer.id)],
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert create_response.data["name"] == "Launchpad"
        assert create_response.data["identifier"] == "LP"
        assert create_response.data["network"] == 0
        assert str(create_response.data["owner"]) == str(reviewer.id)
        assert str(create_response.data["owner_detail"]["id"]) == str(reviewer.id)
        assert str(create_response.data["reviewer_details"][0]["id"]) == str(reviewer.id)
        assert "<script" not in create_response.data["description_html"]

        product_id = create_response.data["id"]
        detail_url = reverse(
            "product-detail",
            kwargs={"slug": self.workspace.slug, "pk": product_id},
        )
        list_response = api_client.get(self.list_url)
        detail_response = api_client.get(detail_url)
        assert list_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in list_response.data] == [product_id]
        assert detail_response.status_code == status.HTTP_200_OK

        update_response = api_client.patch(
            detail_url,
            {
                "name": "Launchpad 2",
                "network": 2,
                "owner": str(self.owner.id),
                "reviewers": [],
            },
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["name"] == "Launchpad 2"
        assert update_response.data["network"] == 2
        assert str(update_response.data["owner"]) == str(self.owner.id)
        assert update_response.data["reviewers"] == []

        with patch("plane.db.mixins.soft_delete_related_objects.delay"):
            delete_response = api_client.delete(detail_url)
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not Product.objects.filter(id=product_id).exists()
        assert Product.all_objects.filter(
            id=product_id, deleted_at__isnull=False
        ).exists()

    def test_rejects_duplicate_names_and_non_workspace_reviewers(self, api_client):
        self.authenticate(api_client, self.owner)
        Product.objects.create(
            name="Launchpad",
            identifier="LAUNCHPAD",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )

        duplicate_response = api_client.post(
            self.list_url,
            {"name": "  Launchpad  ", "identifier": "LP2"},
            format="json",
        )
        assert duplicate_response.status_code == status.HTTP_400_BAD_REQUEST
        assert duplicate_response.data["name"] == ["PRODUCT_NAME_ALREADY_EXISTS"]

        outsider = UserFactory(username=f"product-outsider-{uuid4()}")
        reviewer_response = api_client.post(
            self.list_url,
            {"name": "Another product", "identifier": "ANOTHER", "reviewers": [str(outsider.id)]},
            format="json",
        )
        assert reviewer_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "active members" in reviewer_response.data["reviewers"][0]

        owner_response = api_client.post(
            self.list_url,
            {"name": "Outside owner", "identifier": "OUTSIDE", "owner": str(outsider.id)},
            format="json",
        )
        assert owner_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "active member" in owner_response.data["owner"][0]

        network_response = api_client.post(
            self.list_url,
            {"name": "Invalid network", "identifier": "INVALIDNET", "network": 1},
            format="json",
        )
        assert network_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "valid choice" in network_response.data["network"][0]

    def test_private_product_visibility(self, api_client):
        admin = self.add_member(role=20)
        owner = self.add_member(role=15)
        reviewer = self.add_member(role=5)
        unrelated_member = self.add_member(role=15)
        unrelated_guest = self.add_member(role=5)
        product = Product.objects.create(
            name="Private product",
            identifier="PRIVATE",
            workspace=self.workspace,
            owner=owner,
            network=0,
        )
        product.reviewers.add(reviewer)
        detail_url = reverse(
            "product-detail",
            kwargs={"slug": self.workspace.slug, "pk": product.id},
        )

        for user in (self.owner, admin, owner, reviewer):
            self.authenticate(api_client, user)
            list_response = api_client.get(self.list_url)
            assert list_response.status_code == status.HTTP_200_OK
            assert str(product.id) in [str(item["id"]) for item in list_response.data]
            assert api_client.get(detail_url).status_code == status.HTTP_200_OK

        for user in (unrelated_member, unrelated_guest):
            self.authenticate(api_client, user)
            list_response = api_client.get(self.list_url)
            assert list_response.status_code == status.HTTP_200_OK
            assert str(product.id) not in [str(item["id"]) for item in list_response.data]
            assert api_client.get(detail_url).status_code == status.HTTP_404_NOT_FOUND

    def test_workspace_role_permission_matrix(self, api_client):
        admin = self.add_member(role=20)
        member = self.add_member(role=15)
        guest = self.add_member(role=5)
        product = Product.objects.create(
            name="Shared product",
            identifier="SHARED",
            workspace=self.workspace,
            owner=member,
            network=2,
        )
        detail_url = reverse(
            "product-detail",
            kwargs={"slug": self.workspace.slug, "pk": product.id},
        )

        for user in (self.owner, admin, member, guest):
            self.authenticate(api_client, user)
            assert api_client.get(self.list_url).status_code == status.HTTP_200_OK
            assert api_client.get(detail_url).status_code == status.HTTP_200_OK

        self.authenticate(api_client, guest)
        assert (
            api_client.post(
                self.list_url,
                {"name": "Guest product", "identifier": "GUESTPRD"},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert (
            api_client.patch(
                detail_url, {"name": "Guest edit"}, format="json"
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )

        self.authenticate(api_client, member)
        assert (
            api_client.post(
                self.list_url,
                {"name": "Member product", "identifier": "MEMBERNEW"},
                format="json",
            ).status_code
            == status.HTTP_201_CREATED
        )
        assert (
            api_client.patch(
                detail_url, {"name": "Owner edit"}, format="json"
            ).status_code
            == status.HTTP_200_OK
        )

        other_product = Product.objects.create(
            name="Owner product",
            identifier="OWNERPRD",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        other_detail_url = reverse(
            "product-detail",
            kwargs={"slug": self.workspace.slug, "pk": other_product.id},
        )
        assert (
            api_client.patch(
                other_detail_url, {"name": "Member edit"}, format="json"
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )

        self.authenticate(api_client, admin)
        assert (
            api_client.patch(
                other_detail_url, {"name": "Admin edit"}, format="json"
            ).status_code
            == status.HTTP_200_OK
        )

        deletable_product = Product.objects.create(
            name="Admin deletable product",
            identifier="ADMINDEL",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        deletable_detail_url = reverse(
            "product-detail",
            kwargs={"slug": self.workspace.slug, "pk": deletable_product.id},
        )
        with patch("plane.db.mixins.soft_delete_related_objects.delay"):
            delete_response = api_client.delete(deletable_detail_url)
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT

        self.authenticate(api_client, self.owner)
        assert (
            api_client.patch(
                detail_url, {"name": "Workspace owner edit"}, format="json"
            ).status_code
            == status.HTTP_200_OK
        )

        instance_admin = UserFactory(username=f"product-instance-admin-{uuid4()}")
        instance = Instance.objects.create(
            instance_name="Test instance",
            instance_id=str(uuid4()),
            current_version="1.0.0",
            domain="http://localhost",
            last_checked_at=timezone.now(),
        )
        InstanceAdmin.objects.create(
            instance=instance,
            user=instance_admin,
            is_verified=True,
        )
        self.authenticate(api_client, instance_admin)
        assert api_client.get(self.list_url).status_code == status.HTTP_200_OK
        assert (
            api_client.patch(
                detail_url, {"name": "Instance admin edit"}, format="json"
            ).status_code
            == status.HTTP_200_OK
        )

    def test_product_member_crud_and_multi_role_assignment(self, api_client):
        product = Product.objects.create(
            name="Member product",
            identifier="MEMBERPRD",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        member = self.add_member(role=15)
        product_role = ProductRole.objects.create(
            product=product,
            name=f"Product role {uuid4()}",
            permissions={"can_view": True},
        )
        replacement_role = ProductRole.objects.create(
            product=product,
            name=f"Replacement role {uuid4()}",
            permissions={"can_edit": True},
        )
        other_product = Product.objects.create(
            name="Other member product",
            identifier="OTHERMEM",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        other_product_role = ProductRole.objects.create(
            product=other_product,
            name="Other product role",
        )
        member_list_url = reverse(
            "product-members",
            kwargs={"slug": self.workspace.slug, "product_id": product.id},
        )

        self.authenticate(api_client, self.owner)
        cross_product_invite = api_client.post(
            member_list_url,
            {"member": str(member.id), "custom_role_ids": [other_product_role.id]},
            format="json",
        )
        assert cross_product_invite.status_code == status.HTTP_400_BAD_REQUEST
        assert "same product" in cross_product_invite.data["custom_role_ids"][0]

        invite_response = api_client.post(
            member_list_url,
            {
                "member": str(member.id),
                "custom_role_ids": [product_role.id, replacement_role.id],
            },
            format="json",
        )

        assert invite_response.status_code == status.HTTP_201_CREATED
        assert str(invite_response.data["product"]) == str(product.id)
        assert str(invite_response.data["member"]) == str(member.id)
        assert set(invite_response.data["custom_role_ids"]) == {
            product_role.id,
            replacement_role.id,
        }
        assert str(invite_response.data["member_detail"]["id"]) == str(member.id)
        assert {role["id"] for role in invite_response.data["role_details"]} == {
            product_role.id,
            replacement_role.id,
        }

        product_member_id = invite_response.data["id"]
        detail_url = reverse(
            "product-member-detail",
            kwargs={
                "slug": self.workspace.slug,
                "product_id": product.id,
                "pk": product_member_id,
            },
        )
        roles_url = reverse(
            "product-member-custom-roles",
            kwargs={
                "slug": self.workspace.slug,
                "product_id": product.id,
                "pk": product_member_id,
            },
        )

        list_response = api_client.get(member_list_url)
        detail_response = api_client.get(detail_url)
        assert list_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in list_response.data] == [product_member_id]
        assert detail_response.status_code == status.HTTP_200_OK

        cross_product_assignment = api_client.patch(
            roles_url,
            {"custom_role_ids": [other_product_role.id]},
            format="json",
        )
        assert cross_product_assignment.status_code == status.HTTP_400_BAD_REQUEST
        assert "same product" in cross_product_assignment.data["custom_role_ids"][0]

        role_response = api_client.patch(
            roles_url,
            {"custom_role_ids": [replacement_role.id]},
            format="json",
        )
        assert role_response.status_code == status.HTTP_200_OK
        assert role_response.data["custom_role_ids"] == [replacement_role.id]
        assert [role["id"] for role in role_response.data["role_details"]] == [
            replacement_role.id
        ]

        product_member = ProductMember.objects.get(pk=product_member_id)
        with pytest.raises(ValidationError):
            ProductMemberRole.objects.create(member=product_member, role=other_product_role)

        delete_response = api_client.delete(detail_url)
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProductMember.objects.filter(pk=product_member_id).exists()

    def test_product_member_validation_and_permissions(self, api_client):
        admin = self.add_member(role=20)
        product_owner = self.add_member(role=15)
        guest = self.add_member(role=5)
        member = self.add_member(role=15)
        admin_target = self.add_member(role=15)
        outsider = UserFactory(username=f"product-outsider-{uuid4()}")
        product = Product.objects.create(
            name="Managed member product",
            identifier="MANAGED",
            workspace=self.workspace,
            owner=product_owner,
            network=2,
        )
        member_list_url = reverse(
            "product-members",
            kwargs={"slug": self.workspace.slug, "product_id": product.id},
        )

        self.authenticate(api_client, guest)
        assert api_client.get(member_list_url).status_code == status.HTTP_200_OK
        assert (
            api_client.post(
                member_list_url,
                {"member": str(member.id)},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )

        self.authenticate(api_client, product_owner)
        outsider_response = api_client.post(
            member_list_url,
            {"member": str(outsider.id)},
            format="json",
        )
        assert outsider_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "active member" in outsider_response.data["member"][0]

        invite_response = api_client.post(
            member_list_url,
            {"member": str(member.id)},
            format="json",
        )
        assert invite_response.status_code == status.HTTP_201_CREATED

        duplicate_response = api_client.post(
            member_list_url,
            {"member": str(member.id)},
            format="json",
        )
        assert duplicate_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already belongs" in duplicate_response.data["member"][0]

        self.authenticate(api_client, member)
        assert (
            api_client.post(
                member_list_url,
                {"member": str(admin_target.id)},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )

        self.authenticate(api_client, admin)
        admin_invite_response = api_client.post(
            member_list_url,
            {"member": str(admin_target.id)},
            format="json",
        )
        assert admin_invite_response.status_code == status.HTTP_201_CREATED

    def test_product_member_filters_scope_and_clear_roles(self, api_client):
        product = Product.objects.create(
            name="Filtered member product",
            identifier="FILTERED",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        other_product = Product.objects.create(
            name="Other filtered member product",
            identifier="OTHERFIL",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        role = ProductRole.objects.create(product=product, name="Quality engineer")
        first_member = self.add_member(role=15)
        first_member.first_name = "Zelda"
        first_member.last_name = "Tester"
        first_member.display_name = "Zelda Tester"
        first_member.email = f"zelda-{uuid4()}@example.com"
        first_member.save()
        second_member = self.add_member(role=15)
        first_membership = ProductMember.objects.create(
            product=product,
            member=first_member,
        )
        ProductMemberRole.objects.create(member=first_membership, role=role)
        ProductMember.objects.create(product=product, member=second_member)
        member_list_url = reverse(
            "product-members",
            kwargs={"slug": self.workspace.slug, "product_id": product.id},
        )

        self.authenticate(api_client, self.owner)
        search_response = api_client.get(member_list_url, {"search": "Zelda"})
        assert search_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in search_response.data] == [first_membership.id]

        role_filter_response = api_client.get(member_list_url, {"role_id": role.id})
        assert role_filter_response.status_code == status.HTTP_200_OK
        assert [item["id"] for item in role_filter_response.data] == [
            first_membership.id
        ]

        cross_product_detail_url = reverse(
            "product-member-detail",
            kwargs={
                "slug": self.workspace.slug,
                "product_id": other_product.id,
                "pk": first_membership.id,
            },
        )
        assert (
            api_client.get(cross_product_detail_url).status_code
            == status.HTTP_404_NOT_FOUND
        )

        roles_url = reverse(
            "product-member-custom-roles",
            kwargs={
                "slug": self.workspace.slug,
                "product_id": product.id,
                "pk": first_membership.id,
            },
        )
        clear_role_response = api_client.patch(
            roles_url,
            {"custom_role_ids": []},
            format="json",
        )
        assert clear_role_response.status_code == status.HTTP_200_OK
        assert clear_role_response.data["custom_role_ids"] == []
        assert clear_role_response.data["role_details"] == []

    def test_product_role_crud_scope_and_member_cleanup(self, api_client):
        product = Product.objects.create(
            name="Role product",
            identifier="ROLEPRD",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        other_product = Product.objects.create(
            name="Other role product",
            identifier="OTHERROLE",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        role_list_url = reverse(
            "product-roles",
            kwargs={"slug": self.workspace.slug, "product_id": product.id},
        )
        other_role_list_url = reverse(
            "product-roles",
            kwargs={"slug": self.workspace.slug, "product_id": other_product.id},
        )

        self.authenticate(api_client, self.owner)
        create_response = api_client.post(
            role_list_url,
            {
                "name": "  Quality engineer  ",
                "description": "Owns product quality",
                "permissions": {"should_be_ignored": True},
            },
            format="json",
        )
        assert create_response.status_code == status.HTTP_201_CREATED
        assert create_response.data["name"] == "Quality engineer"
        assert str(create_response.data["product"]) == str(product.id)
        assert create_response.data["permissions"] == {}

        same_name_other_product = api_client.post(
            other_role_list_url,
            {"name": "Quality engineer"},
            format="json",
        )
        assert same_name_other_product.status_code == status.HTTP_201_CREATED

        duplicate_response = api_client.post(
            role_list_url,
            {"name": "Quality engineer"},
            format="json",
        )
        assert duplicate_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already exists" in duplicate_response.data["name"][0]

        role_id = create_response.data["id"]
        detail_url = reverse(
            "product-role-detail",
            kwargs={
                "slug": self.workspace.slug,
                "product_id": product.id,
                "pk": role_id,
            },
        )
        cross_product_detail_url = reverse(
            "product-role-detail",
            kwargs={
                "slug": self.workspace.slug,
                "product_id": other_product.id,
                "pk": role_id,
            },
        )
        list_response = api_client.get(role_list_url)
        detail_response = api_client.get(detail_url)
        assert list_response.status_code == status.HTTP_200_OK
        assert [role["id"] for role in list_response.data] == [role_id]
        assert detail_response.status_code == status.HTTP_200_OK
        assert api_client.get(cross_product_detail_url).status_code == status.HTTP_404_NOT_FOUND

        update_response = api_client.patch(
            detail_url,
            {
                "name": "Quality lead",
                "description": "Updated description",
                "permissions": {"should_still_be_ignored": True},
            },
            format="json",
        )
        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.data["name"] == "Quality lead"
        assert update_response.data["description"] == "Updated description"
        assert update_response.data["permissions"] == {}

        product_member = ProductMember.objects.create(
            product=product,
            member=self.add_member(role=15),
        )
        surviving_role = ProductRole.objects.create(product=product, name="Surviving role")
        ProductMemberRole.objects.create(member=product_member, role_id=role_id)
        ProductMemberRole.objects.create(member=product_member, role=surviving_role)
        delete_response = api_client.delete(detail_url)
        assert delete_response.status_code == status.HTTP_204_NO_CONTENT
        assert not ProductMemberRole.objects.filter(
            member=product_member, role_id=role_id
        ).exists()
        assert ProductMemberRole.objects.filter(
            member=product_member, role=surviving_role
        ).exists()

    def test_product_role_management_permissions(self, api_client):
        admin = self.add_member(role=20)
        product_owner = self.add_member(role=15)
        member = self.add_member(role=15)
        guest = self.add_member(role=5)
        outsider = UserFactory(username=f"product-outsider-{uuid4()}")
        product = Product.objects.create(
            name="Permission role product",
            identifier="PERMROLE",
            workspace=self.workspace,
            owner=product_owner,
            network=2,
        )
        role_list_url = reverse(
            "product-roles",
            kwargs={"slug": self.workspace.slug, "product_id": product.id},
        )

        for index, manager in enumerate((self.owner, admin, product_owner)):
            self.authenticate(api_client, manager)
            assert api_client.get(role_list_url).status_code == status.HTTP_200_OK
            assert (
                api_client.post(
                    role_list_url,
                    {"name": f"Manager role {index}"},
                    format="json",
                ).status_code
                == status.HTTP_201_CREATED
            )

        for unauthorized_user in (member, guest, outsider):
            self.authenticate(api_client, unauthorized_user)
            assert api_client.get(role_list_url).status_code == status.HTTP_403_FORBIDDEN
            assert (
                api_client.post(
                    role_list_url,
                    {"name": f"Forbidden {unauthorized_user.id}"},
                    format="json",
                ).status_code
                == status.HTTP_403_FORBIDDEN
            )
