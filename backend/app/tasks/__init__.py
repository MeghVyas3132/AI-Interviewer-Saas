"""
Celery tasks initialization
"""

from app.tasks.bulk_import import process_bulk_import, check_import_job_status
from app.tasks.candidate_tasks import delete_rejected_candidate

__all__ = [
    "process_bulk_import",
    "check_import_job_status",
    "delete_rejected_candidate",
]
