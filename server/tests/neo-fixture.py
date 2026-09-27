"""Disposable protocol-test issuer. Uses the actual companion Neo app, never production."""
import asyncio
import os
import sys
from pathlib import Path

if os.environ.get("COLLAB_IDENTITY_CONTRACT") != "1":
    raise SystemExit("Only an explicitly disposable identity contract fixture is accepted")
sys.path.insert(0, str(Path(os.environ["NEO_API_DIR"]).resolve()))

from app import db  # noqa: E402
from app.main import create_app  # noqa: E402
import uvicorn  # noqa: E402

async def main():
    async with db.get_engine().begin() as connection:
        await connection.run_sync(db.Base.metadata.create_all)
    await uvicorn.Server(uvicorn.Config(create_app(), host="127.0.0.1", port=int(os.environ["NEO_TEST_PORT"]), log_level="error", access_log=False)).serve()

asyncio.run(main())
