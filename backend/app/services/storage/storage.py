"""
File Storage Service
Owner: Backend Dev 2

Abstraction layer for all file persistence.
Currently saves to local disk under ./uploads/.

TODO: Swap to Azure Blob Storage here only — no other files need to change.
  Steps when ready:
    1. pip install azure-storage-blob
    2. Add AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER to .env
    3. Replace LocalStorageBackend with AzureBlobBackend below
    4. AzureBlobBackend.save() uploads to blob and returns the public URL
    5. Remove the Docker volume mount for ./uploads in docker-compose.yml

Usage:
    from app.services.storage import storage

    url = await storage.save(file, subfolder="logos", filename="myfile.png")
    # returns "/uploads/logos/myfile.png" (local) or full Azure URL (blob)
"""

import os
import uuid
from fastapi import UploadFile


class LocalStorageBackend:
    """
    Saves files to ./uploads/<subfolder>/ on the local filesystem.
    Returns a relative URL path string stored in the DB.
    Files persist across container restarts only if a Docker volume
    is mounted at ./uploads — see docker-compose.yml TODO.
    """

    BASE_DIR = "./uploads"

    async def save(self, file: UploadFile, subfolder: str, filename: str) -> str:
        """
        Save an uploaded file and return the stored path/URL.

        Args:
            file:      FastAPI UploadFile object
            subfolder: e.g. "logos" or "docs/<company_id>"
            filename:  final filename including extension

        Returns:
            Relative URL string, e.g. "/uploads/logos/abc123.png"
        """
        dest_dir = os.path.join(self.BASE_DIR, subfolder)
        os.makedirs(dest_dir, exist_ok=True)

        dest_path = os.path.join(dest_dir, filename)
        contents = await file.read()
        with open(dest_path, "wb") as f:
            f.write(contents)

        return f"/uploads/{subfolder}/{filename}"


# ── Active backend ────────────────────────────────────────────────────────────
# To swap to Azure Blob Storage, replace LocalStorageBackend() with
# AzureBlobBackend() here. Nothing else in the codebase needs to change.

file_storage = LocalStorageBackend()