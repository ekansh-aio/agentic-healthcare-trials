"""
Advertisement routes — split across domain modules.
This file is kept for backwards-compatible imports only.
"""

from app.api.routes.ads_crud import router as _crud_router
from app.api.routes.ads_documents import router as _docs_router
from app.api.routes.ads_generation import router as _gen_router
from app.api.routes.ads_review import router as _review_router
from app.api.routes.ads_meta import router as _meta_router
from app.api.routes.ads_voice import router as _voice_router

# Expose individual routers so main.py can register them all.
routers = [_crud_router, _docs_router, _gen_router, _review_router, _meta_router, _voice_router]
