from django.db import models


class SharedPlan(models.Model):
    """Immutable snapshot of a plan, addressable by a short public slug."""

    slug = models.CharField(max_length=16, primary_key=True)
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.slug
