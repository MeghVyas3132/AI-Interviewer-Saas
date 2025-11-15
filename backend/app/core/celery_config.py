"""
Celery configuration for async email processing
Production-ready with retry logic, rate limiting, and monitoring
"""

import logging
from datetime import timedelta

from celery import Celery, Task
from celery.signals import task_failure, task_retry, task_success
from kombu import Exchange, Queue

from app.core.config import settings

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Celery app
celery_app = Celery(
    "ai_interviewer",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend_url,
)


class ContextTask(Task):
    """Make celery tasks work with FastAPI context"""
    abstract = True

    def __call__(self, *args, **kwargs):
        with app.app_context():
            return self.run(*args, **kwargs)


# Celery configuration
celery_app.conf.update(
    # Broker settings
    broker_url=settings.celery_broker_url,
    result_backend=settings.celery_result_backend_url,
    
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task execution settings
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes (soft limit before hard limit)
    task_acks_late=True,  # Acknowledge task after completion, not before
    worker_prefetch_multiplier=4,  # Worker can prefetch up to 4 tasks
    worker_max_tasks_per_child=1000,  # Restart worker after 1000 tasks
    
    # Retry settings
    task_autoretry_for=(Exception,),
    task_max_retries=3,
    task_default_retry_delay=60,  # 1 minute
    
    # Result backend settings
    result_expires=3600,  # Results expire after 1 hour
    result_extended=True,  # Store additional task metadata
    
    # Queue settings
    task_default_queue="default",
    task_default_exchange="tasks",
    task_default_routing_key="task.default",
    
    # Email-specific rate limiting
    # Prevent overwhelming email provider
    task_rate_limit={
        "tasks.send_email": "100/m",  # 100 emails per minute max
        "tasks.send_bulk_emails": "10/m",  # 10 bulk jobs per minute
    },
)


# Define task queues
celery_app.conf.task_queues = (
    # High priority queue for time-sensitive emails
    Queue(
        "email_high",
        exchange=Exchange("tasks", type="direct"),
        routing_key="email.high",
        queue_arguments={
            "x-max-priority": 10,
            "x-message-ttl": 3600000,  # 1 hour TTL
        },
    ),
    # Normal priority queue for regular emails
    Queue(
        "email_default",
        exchange=Exchange("tasks", type="direct"),
        routing_key="email.default",
        queue_arguments={
            "x-max-priority": 5,
            "x-message-ttl": 7200000,  # 2 hours TTL
        },
    ),
    # Low priority queue for bulk/marketing emails
    Queue(
        "email_low",
        exchange=Exchange("tasks", type="direct"),
        routing_key="email.low",
        queue_arguments={
            "x-max-priority": 1,
            "x-message-ttl": 86400000,  # 24 hours TTL
        },
    ),
    # Default queue for miscellaneous tasks
    Queue(
        "default",
        exchange=Exchange("tasks", type="direct"),
        routing_key="task.default",
    ),
)


# Task routes - specify which queue tasks go to
celery_app.conf.task_routes = {
    "tasks.send_verification_email": {"queue": "email_high"},
    "tasks.send_password_reset_email": {"queue": "email_high"},
    "tasks.send_interview_reminder": {"queue": "email_high"},
    "tasks.send_bulk_candidate_invitations": {"queue": "email_default"},
    "tasks.send_bulk_emails": {"queue": "email_default"},
    "tasks.send_status_update_email": {"queue": "email_default"},
    "tasks.send_feedback_notification": {"queue": "email_low"},
}


# Celery signals for monitoring
@task_success.connect
def task_success_handler(sender=None, result=None, **kwargs):
    """Handle successful task completion"""
    logger.info(f"✅ Task {sender.name} completed successfully. Result: {result}")


@task_retry.connect
def task_retry_handler(sender=None, reason=None, einfo=None, **kwargs):
    """Handle task retry"""
    logger.warning(f"⚠️ Task {sender.name} retrying. Reason: {reason}")


@task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, args=None, kwargs=None, traceback=None, einfo=None, **kwargs_extra):
    """Handle task failure"""
    logger.error(f"❌ Task {sender.name} failed. Exception: {exception}")


# Worker configuration
celery_app.conf.worker_log_format = "[%(asctime)s: %(levelname)s/%(processName)s] %(message)s"
celery_app.conf.worker_task_log_format = "[%(asctime)s: %(levelname)s/%(processName)s] [%(task_name)s(%(task_id)s)] %(message)s"


def get_celery_app() -> Celery:
    """Get Celery app instance"""
    return celery_app
