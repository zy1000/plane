from django.db.models.signals import post_save
from django.dispatch import receiver

from . import Workspace, IssueTypeCategory


@receiver(post_save, sender=Workspace)
def create_issue_type_category(sender, instance, created, **kwargs):
    print(111)
    if created:
        IssueTypeCategory.objects.create(workspace=instance, )
        bulk_obj = [
            IssueTypeCategory(workspace=instance, name='需求', is_system=True),
            IssueTypeCategory(workspace=instance, name='任务', is_system=True),
            IssueTypeCategory(workspace=instance, name='缺陷', is_system=True),
        ]
        IssueTypeCategory.objects.bulk_create(bulk_obj)
