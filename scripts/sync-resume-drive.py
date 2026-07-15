import json
import os
import datetime
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

LOCAL_PDF_PATH = Path("public/resume/Sankalp-Jha-Resume.pdf")
METADATA_PATH = Path("src/generated/resume.json")
TIMESTAMP = datetime.datetime.now().strftime("%Y%m")
DRIVE_FILE_NAME = f"Sankalp-Jha-Resume-{TIMESTAMP}.pdf"

# OAuth scopes
SCOPES = ['https://www.googleapis.com/auth/drive.file']


def get_credentials():
    """Get OAuth credentials from GitHub secret or local token.json."""
    creds = None
    
    # 1. Try to load from environment variable (GitHub Actions)
    token_json = os.environ.get("DRIVE_OAUTH_TOKEN")
    if token_json:
        creds = Credentials.from_authorized_user_info(json.loads(token_json), SCOPES)
    else:
        # 2. Fallback to local token.json for local development
        token_path = Path("token.json")
        if token_path.exists():
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    
    # 3. Refresh if needed
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("🔄 Refreshing access token...")
            creds.refresh(Request())
        else:
            raise ValueError(
                "No valid credentials found. Please run:\n"
                "  python scripts/setup_oauth.py\n"
                "to authorize and generate a token."
            )
    
    return creds

def main() -> None:
    # Validate environment
    folder_id = os.environ.get("DRIVE_FOLDER_ID", "").strip()
    if not folder_id:
        raise ValueError("DRIVE_FOLDER_ID is missing!")
    
    if not LOCAL_PDF_PATH.exists():
        raise FileNotFoundError(f"Local PDF not found at: {LOCAL_PDF_PATH}")
    
    # Get OAuth credentials
    creds = get_credentials()
    
    # Build Drive API client
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    
    # Search for existing file this month
    escaped_name = DRIVE_FILE_NAME.replace("'", "\\'")
    query = f"name = '{escaped_name}' and '{folder_id}' in parents and trashed = false"
    matches = drive.files().list(q=query, fields="files(id, webViewLink)").execute()["files"]
    
    media = MediaFileUpload(str(LOCAL_PDF_PATH), mimetype="application/pdf", resumable=True)
    
    # Upload or update
    if matches:
        file_id = matches[0]["id"]
        uploaded = drive.files().update(
            fileId=file_id,
            media_body=media,
            fields="id, webViewLink",
        ).execute()
        print(f"🔄 Updated existing file: {DRIVE_FILE_NAME}")
    else:
        uploaded = drive.files().create(
            body={
                "name": DRIVE_FILE_NAME,
                "parents": [folder_id]
            },
            media_body=media,
            fields="id, webViewLink",
        ).execute()
        print(f"✨ Created new file: {DRIVE_FILE_NAME}")
    
    # Set permissions to anyone with link can view
    permissions = drive.permissions().list(
        fileId=uploaded["id"],
        fields="permissions(type, role)",
    ).execute().get("permissions", [])
    
    if not any(item["type"] == "anyone" and item["role"] == "reader" for item in permissions):
        drive.permissions().create(
            fileId=uploaded["id"],
            body={"type": "anyone", "role": "reader"},
        ).execute()
        print(" Set file to 'Anyone with the link can view'")
    
    # Save metadata
    drive_url = uploaded.get("webViewLink") or f"https://drive.google.com/file/d/{uploaded['id']}/view"
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(
        json.dumps({
            "driveUrl": drive_url,
            "fileName": DRIVE_FILE_NAME,
            "source": "google-drive-oauth"
        }, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"✅ Successfully uploaded to Google Drive!\n🔗 {drive_url}")


if __name__ == "__main__":
    main()