import os
import json
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# If modifying these scopes, delete the token.json file.
SCOPES = ['https://www.googleapis.com/auth/drive.file']  # Only manage files created by the app

def main():
    creds = None
    token_path = Path("token.json")
    credentials_path = Path("client_secret.json")
    
    # Check if client_secret.json exists
    if not credentials_path.exists():
        print("❌ Error: client_secret.json not found!")
        print("   Download your OAuth 2.0 Client ID JSON from Google Cloud Console")
        print("   and save it as 'client_secret.json' in the project root.")
        return
    
    # Load client config
    with open(credentials_path) as f:
        client_config = json.load(f)
    
    # Try to load existing token
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(token_path, SCOPES)
    
    # If no valid credentials, run OAuth flow
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("🔄 Refreshing access token...")
            creds.refresh(Request())
        else:
            print("🔐 Starting OAuth 2.0 authorization flow...")
            print("   A browser window will open. Please:")
            print("   1. Log in with sankalp.jha9643@gmail.com")
            print("   2. Click 'Allow' to grant permissions")
            print("   3. You'll be redirected to localhost (this is normal)")
            print()
            
            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save the credentials for future use
        with open(token_path, 'w') as token:
            token.write(creds.to_json())
        print(f"✅ Token saved to {token_path}")
    
    print("\n✅ Authorization successful!")
    print(f"   User: {creds.id_token['email'] if creds.id_token else 'N/A'}")
    print(f"   Token expires: {creds.expiry}")
    print("\n📋 Next steps:")
    print("   1. Copy the contents of 'token.json'")
    print("   2. Add it as a GitHub Secret named 'DRIVE_OAUTH_TOKEN'")
    print("   3. Delete 'client_secret.json' and 'token.json' (don't commit them!)")

if __name__ == '__main__':
    main()