"""Date helpers shared across services and routers."""

from datetime import datetime, timedelta


def roll_to_weekday(dt: datetime) -> datetime:
    """Roll a weekend datetime forward to the following Monday.

    Saturday (``weekday()`` 5) moves +2 days and Sunday (6) +1 day, so step
    due dates never land on a weekend. Weekday inputs (Mon–Fri) are returned
    unchanged; time-of-day and tzinfo are preserved.
    """
    weekday = dt.weekday()
    if weekday >= 5:
        return dt + timedelta(days=7 - weekday)
    return dt
