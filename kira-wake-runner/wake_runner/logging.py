import json
import logging
import time


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        value = {"ts": int(time.time()), "level": record.levelname, "event": record.getMessage()}
        for key in ("message_id", "status"):
            if hasattr(record, key):
                value[key] = getattr(record, key)
        return json.dumps(value, separators=(",", ":"))


def configure() -> logging.Logger:
    logger = logging.getLogger("wake_runner")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger

