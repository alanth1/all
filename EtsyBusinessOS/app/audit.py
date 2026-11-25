from __future__ import annotations

import logging

from . import db
from .util import dumps, now

log = logging.getLogger("ebos.audit")


def audit(actor: str, action: str, entity: str | None = None, entity_id=None, detail=None, outcome: str = "ok"):
    db.ex("INSERT INTO audit_logs(actor, action, entity, entity_id, detail, outcome, created_at) VALUES(?,?,?,?,?,?,?)",
          (actor, action, entity, None if entity_id is None else str(entity_id),
           dumps(detail) if detail is not None else None, outcome, now()))
    log.info("%s %s %s:%s %s", actor, action, entity, entity_id, outcome)


def notify(level: str, title: str, body: str = "", link: str = ""):
    db.ex("INSERT INTO notifications(level, title, body, link, created_at) VALUES(?,?,?,?,?)",
          (level, title, body, link, now()))
