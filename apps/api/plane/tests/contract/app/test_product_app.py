from unittest.mock import patch
from uuid import uuid4

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from plane.db.models import Product, WorkspaceMember
from plane.license.models import Instance, InstanceAdmin
from plane.tests.factories import UserFactory, WorkspaceFactory


@pytest.mark.contract
@pytest.mark.django_db
class TestProductApp:
    def setup_method(self):
        self.owner = UserFactory()
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
        user = UserFactory()
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
                "description_html": '<p>Hello</p><script>alert("x")</script>',
                "network": 0,
                "owner": str(reviewer.id),
                "reviewers": [str(reviewer.id)],
            },
            format="json",
        )

        assert create_response.status_code == status.HTTP_201_CREATED
        assert create_response.data["name"] == "Launchpad"
        assert create_response.data["network"] == 0
        assert create_response.data["owner"] == str(reviewer.id)
        assert create_response.data["owner_detail"]["id"] == str(reviewer.id)
        assert create_response.data["reviewer_details"][0]["id"] == str(reviewer.id)
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
        assert update_response.data["owner"] == str(self.owner.id)
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
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )

        duplicate_response = api_client.post(
            self.list_url,
            {"name": "  Launchpad  "},
            format="json",
        )
        assert duplicate_response.status_code == status.HTTP_400_BAD_REQUEST
        assert duplicate_response.data["name"] == ["PRODUCT_NAME_ALREADY_EXISTS"]

        outsider = UserFactory()
        reviewer_response = api_client.post(
            self.list_url,
            {"name": "Another product", "reviewers": [str(outsider.id)]},
            format="json",
        )
        assert reviewer_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "active members" in reviewer_response.data["reviewers"][0]

        owner_response = api_client.post(
            self.list_url,
            {"name": "Outside owner", "owner": str(outsider.id)},
            format="json",
        )
        assert owner_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "active member" in owner_response.data["owner"][0]

        network_response = api_client.post(
            self.list_url,
            {"name": "Invalid network", "network": 1},
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
            assert str(product.id) in [item["id"] for item in list_response.data]
            assert api_client.get(detail_url).status_code == status.HTTP_200_OK

        for user in (unrelated_member, unrelated_guest):
            self.authenticate(api_client, user)
            list_response = api_client.get(self.list_url)
            assert list_response.status_code == status.HTTP_200_OK
            assert str(product.id) not in [item["id"] for item in list_response.data]
            assert api_client.get(detail_url).status_code == status.HTTP_404_NOT_FOUND

    def test_workspace_role_permission_matrix(self, api_client):
        admin = self.add_member(role=20)
        member = self.add_member(role=15)
        guest = self.add_member(role=5)
        product = Product.objects.create(
            name="Shared product",
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
                self.list_url, {"name": "Guest product"}, format="json"
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
                self.list_url, {"name": "Member product"}, format="json"
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

        instance_admin = UserFactory()
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
