# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging
import re
from datetime import datetime

from bs4 import BeautifulSoup

# Third party imports
from celery import shared_task
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string

# Django imports
from django.utils import timezone

# Module imports
from plane.db.models import Cycle, EmailNotificationLog, Issue, Release, User
from plane.license.utils.instance_value import get_email_configuration
from plane.settings.redis import redis_instance
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception


def remove_unwanted_characters(input_text):
    # Remove only control characters and potentially problematic characters for email subjects
    processed_text = re.sub(r"[\x00-\x1F\x7F-\x9F]", "", input_text)
    return processed_text


# acquire and delete redis lock
def acquire_lock(lock_id, expire_time=300):
    redis_client = redis_instance()
    """Attempt to acquire a lock with a specified expiration time."""
    return redis_client.set(lock_id, "true", nx=True, ex=expire_time)


def release_lock(lock_id):
    """Release a lock."""
    redis_client = redis_instance()
    redis_client.delete(lock_id)


@shared_task
def stack_email_notification():
    # Aggregate all unsent email notification logs and fan out per entity
    # type to the matching send task. ``issue`` logs keep their original
    # (receiver -> issue -> actor list) payload shape; ``cycle`` / ``release``
    # logs get grouped per (receiver, entity_identifier) too but dispatched
    # to their own senders.
    email_notifications = list(
        EmailNotificationLog.objects.filter(processed_at__isnull=True).order_by("receiver").values()
    )
    processed_notifications = []

    # Split by entity_name so each bucket can use its own aggregation shape.
    buckets = {"issue": [], "cycle": [], "release": []}
    for notification in email_notifications:
        entity_name = notification.get("entity_name")
        if entity_name not in buckets:
            # Unknown entity - keep legacy behaviour and treat as issue.
            entity_name = "issue"
        buckets[entity_name].append(notification)

    # --- Issue bucket (existing behaviour, unchanged) -------------------
    issue_notifications = buckets["issue"]
    issue_receivers = list(set(str(n.get("receiver_id")) for n in issue_notifications))
    for receiver_id in issue_receivers:
        receiver_notifications = [
            n for n in issue_notifications if str(n.get("receiver_id")) == receiver_id
        ]
        payload = {}
        email_notification_ids = []
        for receiver_notification in receiver_notifications:
            payload.setdefault(receiver_notification.get("entity_identifier"), {}).setdefault(
                str(receiver_notification.get("triggered_by_id")), []
            ).append(receiver_notification.get("data"))
            processed_notifications.append(receiver_notification.get("id"))
            email_notification_ids.append(receiver_notification.get("id"))

        for issue_id, notification_data in payload.items():
            send_email_notification.delay(
                issue_id=issue_id,
                notification_data=notification_data,
                receiver_id=receiver_id,
                email_notification_ids=email_notification_ids,
            )

    # --- Cycle / Release buckets ---------------------------------------
    for entity_name in ("cycle", "release"):
        entity_notifications = buckets[entity_name]
        if not entity_notifications:
            continue

        # Group by (receiver_id, entity_identifier) so one email per entity
        # per receiver even if many transitions queued up.
        grouped = {}
        for n in entity_notifications:
            key = (str(n.get("receiver_id")), str(n.get("entity_identifier")))
            grouped.setdefault(key, []).append(n)

        for (receiver_id, entity_id), rows in grouped.items():
            rows_sorted = sorted(rows, key=lambda r: r.get("created_at"))
            email_notification_ids = [r.get("id") for r in rows_sorted]
            processed_notifications.extend(email_notification_ids)

            # Keep the first observed old_value and the latest new_value so
            # a pause -> completed sequence renders as old -> completed.
            first = rows_sorted[0]
            last = rows_sorted[-1]
            activity_payload = first.get("data", {}) or {}
            aggregated_data = {
                **(activity_payload.get(f"{entity_name}_activity") or {}),
                "old_status": first.get("old_value"),
                "new_status": last.get("new_value"),
                "triggered_by_id": str(first.get("triggered_by_id")),
            }

            task = (
                send_cycle_status_email if entity_name == "cycle" else send_release_status_email
            )
            task.delay(
                entity_id=entity_id,
                receiver_id=receiver_id,
                notification_data=aggregated_data,
                email_notification_ids=email_notification_ids,
            )

    # Update the email notification log
    EmailNotificationLog.objects.filter(pk__in=processed_notifications).update(processed_at=timezone.now())


def create_payload(notification_data):
    # return format {"actor_id":  { "key": { "old_value": [], "new_value": [] } }}
    data = {}
    for actor_id, changes in notification_data.items():
        for change in changes:
            issue_activity = change.get("issue_activity")
            if issue_activity:  # Ensure issue_activity is not None
                field = issue_activity.get("field")
                old_value = str(issue_activity.get("old_value"))
                new_value = str(issue_activity.get("new_value"))

                # Append old_value if it's not empty and not already in the list
                if old_value:
                    (
                        data.setdefault(actor_id, {})
                        .setdefault(field, {})
                        .setdefault("old_value", [])
                        .append(old_value)
                        if old_value not in data.setdefault(actor_id, {}).setdefault(field, {}).get("old_value", [])
                        else None
                    )

                # Append new_value if it's not empty and not already in the list
                if new_value:
                    (
                        data.setdefault(actor_id, {})
                        .setdefault(field, {})
                        .setdefault("new_value", [])
                        .append(new_value)
                        if new_value not in data.setdefault(actor_id, {}).setdefault(field, {}).get("new_value", [])
                        else None
                    )

                if not data.get("actor_id", {}).get("activity_time", False):
                    data[actor_id]["activity_time"] = str(
                        datetime.fromisoformat(issue_activity.get("activity_time").rstrip("Z")).strftime(
                            "%Y-%m-%d %H:%M:%S"
                        )
                    )

    return data


def process_mention(mention_component):
    soup = BeautifulSoup(mention_component, "html.parser")
    mentions = soup.find_all("mention-component")
    for mention in mentions:
        user_id = mention["entity_identifier"]
        user = User.objects.get(pk=user_id)
        user_name = user.display_name
        highlighted_name = f"@{user_name}"
        mention.replace_with(highlighted_name)
    return str(soup)


def process_html_content(content):
    if content is None:
        return None
    processed_content_list = []
    for html_content in content:
        processed_content = process_mention(html_content)
        processed_content_list.append(processed_content)
    return processed_content_list


@shared_task
def send_email_notification(issue_id, notification_data, receiver_id, email_notification_ids):
    # Convert UUIDs to a sorted, concatenated string
    sorted_ids = sorted(email_notification_ids)
    ids_str = "_".join(str(id) for id in sorted_ids)
    lock_id = f"send_email_notif_{issue_id}_{receiver_id}_{ids_str}"

    # acquire the lock for sending emails
    try:
        if acquire_lock(lock_id=lock_id):
            # get the redis instance
            ri = redis_instance()
            base_api = ri.get(str(issue_id)).decode() if ri.get(str(issue_id)) else None

            # Skip if base api is not present
            if not base_api:
                return

            data = create_payload(notification_data=notification_data)

            # Get email configurations
            (
                EMAIL_HOST,
                EMAIL_HOST_USER,
                EMAIL_HOST_PASSWORD,
                EMAIL_PORT,
                EMAIL_USE_TLS,
                EMAIL_USE_SSL,
                EMAIL_FROM,
            ) = get_email_configuration()

            receiver = User.objects.get(pk=receiver_id)
            issue = Issue.objects.get(pk=issue_id)
            template_data = []
            total_changes = 0
            comments = []
            actors_involved = []
            for actor_id, changes in data.items():
                actor = User.objects.get(pk=actor_id)
                total_changes = total_changes + len(changes)
                comment = changes.pop("comment", False)
                mention = changes.pop("mention", False)
                actors_involved.append(actor_id)
                if comment:
                    comments.append(
                        {
                            "actor_comments": comment,
                            "actor_detail": {
                                "avatar_url": f"{base_api}{actor.avatar_url}",
                                "first_name": actor.first_name,
                                "last_name": actor.last_name,
                                "display_name": (
                                    actor.display_name
                                    or actor.first_name
                                    or actor.email
                                ),
                            },
                        }
                    )
                if mention:
                    mention["new_value"] = process_html_content(mention.get("new_value"))
                    mention["old_value"] = process_html_content(mention.get("old_value"))
                    comments.append(
                        {
                            "actor_comments": mention,
                            "actor_detail": {
                                "avatar_url": f"{base_api}{actor.avatar_url}",
                                "first_name": actor.first_name,
                                "last_name": actor.last_name,
                                "display_name": (
                                    actor.display_name
                                    or actor.first_name
                                    or actor.email
                                ),
                            },
                        }
                    )
                activity_time = changes.pop("activity_time")
                # Parse the input string into a datetime object
                formatted_time = datetime.strptime(activity_time, "%Y-%m-%d %H:%M:%S").strftime("%H:%M %p")

                if changes:
                    template_data.append(
                        {
                            "actor_detail": {
                                "avatar_url": f"{base_api}{actor.avatar_url}",
                                "first_name": actor.first_name,
                                "last_name": actor.last_name,
                                "display_name": (
                                    actor.display_name
                                    or actor.first_name
                                    or actor.email
                                ),
                            },
                            "changes": changes,
                            "issue_details": {
                                "name": issue.name,
                                "identifier": f"{issue.project.identifier}-{issue.sequence_id}",
                            },
                            "activity_time": str(formatted_time),
                        }
                    )

            summary = "Updates were made to the issue by"

            # Send the mail
            subject = f"{issue.project.identifier}-{issue.sequence_id} {remove_unwanted_characters(issue.name)}"
            context = {
                "data": template_data,
                "summary": summary,
                "actors_involved": len(set(actors_involved)),
                "issue": {
                    "issue_identifier": f"{str(issue.project.identifier)}-{str(issue.sequence_id)}",
                    "name": issue.name,
                    "issue_url": f"{base_api}/{str(issue.project.workspace.slug)}/projects/{str(issue.project.id)}/issues/{str(issue.id)}",  # noqa: E501
                },
                "receiver": {"email": receiver.email},
                "issue_url": f"{base_api}/{str(issue.project.workspace.slug)}/projects/{str(issue.project.id)}/issues/{str(issue.id)}",  # noqa: E501
                "project_url": f"{base_api}/{str(issue.project.workspace.slug)}/projects/{str(issue.project.id)}/issues/",  # noqa: E501
                "workspace": str(issue.project.workspace.slug),
                "project": str(issue.project.name),
                "user_preference": f"{base_api}/{str(issue.project.workspace.slug)}/settings/account/notifications/",
                "comments": comments,
                "entity_type": "issue",
            }
            html_content = render_to_string("emails/notifications/issue-updates.html", context)
            text_content = generate_plain_text_from_html(html_content)

            try:
                connection = get_connection(
                    host=EMAIL_HOST,
                    port=int(EMAIL_PORT),
                    username=EMAIL_HOST_USER,
                    password=EMAIL_HOST_PASSWORD,
                    use_tls=EMAIL_USE_TLS == "1",
                    use_ssl=EMAIL_USE_SSL == "1",
                )

                msg = EmailMultiAlternatives(
                    subject=subject,
                    body=text_content,
                    from_email=EMAIL_FROM,
                    to=[receiver.email],
                    connection=connection,
                )
                msg.attach_alternative(html_content, "text/html")
                msg.send()
                logging.getLogger("plane.worker").info("Email Sent Successfully")

                # Update the logs
                EmailNotificationLog.objects.filter(pk__in=email_notification_ids).update(sent_at=timezone.now())

                # release the lock
                release_lock(lock_id=lock_id)
                return
            except Exception as e:
                log_exception(e)
                # release the lock
                release_lock(lock_id=lock_id)
                return
        else:
            logging.getLogger("plane.worker").info("Duplicate email received skipping")
            return
    except (Issue.DoesNotExist, User.DoesNotExist):
        release_lock(lock_id=lock_id)
        return
    except Exception as e:
        log_exception(e)
        release_lock(lock_id=lock_id)
        return


def _send_entity_status_email(
    *,
    entity_kind,
    entity_id,
    receiver_id,
    notification_data,
    email_notification_ids,
    model_class,
    origin_redis_prefix,
    url_segment,
    template_name,
):
    """Shared implementation for cycle/release status-change emails.

    ``notification_data`` is the aggregated payload prepared by
    ``stack_email_notification`` (at least ``old_status``/``new_status`` and
    the same payload the dispatch task stashed into ``EmailNotificationLog.data``).
    """
    sorted_ids = sorted(email_notification_ids or [])
    ids_str = "_".join(str(nid) for nid in sorted_ids)
    lock_id = f"send_{entity_kind}_status_email_{entity_id}_{receiver_id}_{ids_str}"

    try:
        if not acquire_lock(lock_id=lock_id):
            logging.getLogger("plane.worker").info(
                "Duplicate %s status email received skipping", entity_kind
            )
            return

        ri = redis_instance()
        origin_key = f"{origin_redis_prefix}:{entity_id}"
        raw_origin = ri.get(origin_key)
        base_api = raw_origin.decode() if raw_origin else (notification_data or {}).get("origin")

        if not base_api:
            # Mirror the issue path: without an origin we cannot build links,
            # so skip rather than send a broken email. Leaving the log rows
            # with ``processed_at`` set (done by the aggregator) means we do
            # not retry indefinitely.
            release_lock(lock_id=lock_id)
            return

        (
            EMAIL_HOST,
            EMAIL_HOST_USER,
            EMAIL_HOST_PASSWORD,
            EMAIL_PORT,
            EMAIL_USE_TLS,
            EMAIL_USE_SSL,
            EMAIL_FROM,
        ) = get_email_configuration()

        receiver = User.objects.get(pk=receiver_id)
        entity = model_class.objects.select_related("project", "project__workspace").get(pk=entity_id)

        data = dict(notification_data or {})
        workspace_slug = data.get("workspace_slug") or entity.project.workspace.slug
        project_id = data.get("project_id") or str(entity.project_id)
        project_name = data.get("project_name") or entity.project.name
        workspace_name = data.get("workspace_name") or entity.project.workspace.name

        actor = None
        actor_id = data.get("actor_id")
        triggered_by_id = data.get("triggered_by_id")
        lookup_id = actor_id or triggered_by_id
        if lookup_id:
            try:
                actor = User.objects.get(pk=lookup_id)
            except User.DoesNotExist:
                actor = None

        is_system = data.get("is_system") or actor_id is None

        entity_url = (
            f"{base_api}/{workspace_slug}/projects/{project_id}/{url_segment}/{entity_id}"
        )
        project_url = f"{base_api}/{workspace_slug}/projects/{project_id}/{url_segment}/"

        context = {
            "entity_kind": entity_kind,
            "entity": {
                "id": str(entity.id),
                "name": data.get("name") or entity.name,
                "url": entity_url,
                "start_date": data.get("start_date"),
                "end_date": data.get("end_date"),
                "target_date": data.get("target_date"),
            },
            "status": {
                "old": data.get("old_status"),
                "new": data.get("new_status"),
                "old_label": data.get("old_status_label") or data.get("old_status"),
                "new_label": data.get("new_status_label") or data.get("new_status"),
            },
            "actor": (
                {
                    "first_name": actor.first_name,
                    "last_name": actor.last_name,
                    "display_name": actor.display_name,
                    "email": actor.email,
                    "avatar_url": f"{base_api}{actor.avatar_url}" if actor.avatar_url else None,
                }
                if actor is not None
                else None
            ),
            "is_system": is_system,
            "activity_time": data.get("activity_time"),
            "workspace": workspace_slug,
            "workspace_name": workspace_name,
            "project": project_name,
            "project_url": project_url,
            "receiver": {"email": receiver.email},
            "user_preference": f"{base_api}/{workspace_slug}/settings/account/notifications/",
        }

        subject = (
            f"[{project_name}] "
            f"{context['entity']['name']} "
            f"状态更新为 {context['status']['new_label']}"
        )

        html_content = render_to_string(template_name, context)
        text_content = generate_plain_text_from_html(html_content)

        try:
            connection = get_connection(
                host=EMAIL_HOST,
                port=int(EMAIL_PORT),
                username=EMAIL_HOST_USER,
                password=EMAIL_HOST_PASSWORD,
                use_tls=EMAIL_USE_TLS == "1",
                use_ssl=EMAIL_USE_SSL == "1",
            )
            msg = EmailMultiAlternatives(
                subject=remove_unwanted_characters(subject),
                body=text_content,
                from_email=EMAIL_FROM,
                to=[receiver.email],
                connection=connection,
            )
            msg.attach_alternative(html_content, "text/html")
            msg.send()
            logging.getLogger("plane.worker").info(
                "%s status email sent successfully", entity_kind.capitalize()
            )

            EmailNotificationLog.objects.filter(pk__in=email_notification_ids).update(
                sent_at=timezone.now()
            )
            release_lock(lock_id=lock_id)
            return
        except Exception as e:
            log_exception(e)
            release_lock(lock_id=lock_id)
            return
    except (model_class.DoesNotExist, User.DoesNotExist):
        release_lock(lock_id=lock_id)
        return
    except Exception as e:
        log_exception(e)
        release_lock(lock_id=lock_id)
        return


@shared_task
def send_cycle_status_email(entity_id, receiver_id, notification_data, email_notification_ids):
    from plane.bgtasks.entity_status_email_task import CYCLE_ORIGIN_REDIS_PREFIX

    _send_entity_status_email(
        entity_kind="cycle",
        entity_id=entity_id,
        receiver_id=receiver_id,
        notification_data=notification_data,
        email_notification_ids=email_notification_ids,
        model_class=Cycle,
        origin_redis_prefix=CYCLE_ORIGIN_REDIS_PREFIX,
        url_segment="cycles",
        template_name="emails/notifications/cycle-status-update.html",
    )


@shared_task
def send_release_status_email(entity_id, receiver_id, notification_data, email_notification_ids):
    from plane.bgtasks.entity_status_email_task import RELEASE_ORIGIN_REDIS_PREFIX

    _send_entity_status_email(
        entity_kind="release",
        entity_id=entity_id,
        receiver_id=receiver_id,
        notification_data=notification_data,
        email_notification_ids=email_notification_ids,
        model_class=Release,
        origin_redis_prefix=RELEASE_ORIGIN_REDIS_PREFIX,
        url_segment="releases",
        template_name="emails/notifications/release-status-update.html",
    )
