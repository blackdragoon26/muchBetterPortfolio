import json
import os
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


PDF_PATH = Path("public/resume/Sankalp-Jha-Resume.pdf")
METADATA_PATH = Path("src/generated/resume.json")
FILE_NAME = PDF_PATH.name


def main() -> None:
    credentials_info = json.loads(os.environ["DRIVE_SERVICE_ACCOUNT_JSON"])
    folder_id = os.environ["DRIVE_FOLDER_ID"]
    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
    escaped_name = FILE_NAME.replace("'", "\\'")
    query = f"name = '{escaped_name}' and '{folder_id}' in parents and trashed = false"
    matches = drive.files().list(q=query, fields="files(id, webViewLink)").execute()["files"]
    media = MediaFileUpload(str(PDF_PATH), mimetype="application/pdf", resumable=True)

    if matches:
        file_id = matches[0]["id"]
        uploaded = drive.files().update(
            fileId=file_id,
            media_body=media,
            fields="id, webViewLink",
        ).execute()
    else:
        uploaded = drive.files().create(
            body={"name": FILE_NAME, "parents": [folder_id]},
            media_body=media,
            fields="id, webViewLink",
        ).execute()

    permissions = drive.permissions().list(
        fileId=uploaded["id"],
        fields="permissions(type, role)",
    ).execute().get("permissions", [])
    if not any(item["type"] == "anyone" and item["role"] == "reader" for item in permissions):
        drive.permissions().create(
            fileId=uploaded["id"],
            body={"type": "anyone", "role": "reader"},
        ).execute()

    drive_url = uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{uploaded['id']}/view"
    METADATA_PATH.write_text(
        json.dumps({"driveUrl": drive_url}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated Google Drive résumé: {drive_url}")


if __name__ == "__main__":
    main()
