"""Model registry.

Importing every model here ensures they are attached to ``Base.metadata`` so
Alembic autogenerate and ``create_all`` can see them.
"""

from app.models.action_chain import ActionChain
from app.models.activity import Activity
from app.models.activity_type import ActivityType
from app.models.base import Base
from app.models.chain_step import ChainStep
from app.models.close_reason import CloseReason
from app.models.company import Company
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.email_ignore_entry import EmailIgnoreEntry
from app.models.pipeline_stage import PipelineStage
from app.models.sequence import Sequence
from app.models.sequence_step import SequenceStep
from app.models.unmatched_email import UnmatchedEmail
from app.models.user import User

__all__ = [
    "Base",
    "User",
    "Company",
    "Contact",
    "ActivityType",
    "Activity",
    "ActionChain",
    "ChainStep",
    "Sequence",
    "SequenceStep",
    "PipelineStage",
    "CloseReason",
    "Deal",
    "UnmatchedEmail",
    "EmailIgnoreEntry",
]
