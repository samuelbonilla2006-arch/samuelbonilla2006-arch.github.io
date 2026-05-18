from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
from pathlib import Path
from datetime import datetime, timezone
from cryptography.fernet import Fernet


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (kept from template, not used by Titán Terminal)
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------- Titán Terminal encrypted credentials setup ----------
CREDENTIALS_DIR = ROOT_DIR / 'credentials'
CREDENTIALS_DIR.mkdir(exist_ok=True)
KEY_FILE = CREDENTIALS_DIR / 'secret.key'
CRED_FILE = CREDENTIALS_DIR / 'encrypted_credentials.bin'
COMMANDS_FILE = ROOT_DIR / 'commands.json'
DASHBOARD_DATA_FILE = ROOT_DIR.parent / 'frontend' / 'public' / 'dashboard_data.json'

if not KEY_FILE.exists():
    KEY_FILE.write_bytes(Fernet.generate_key())
cipher = Fernet(KEY_FILE.read_bytes())

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Titán Terminal API"}


# ---------- Titán Terminal endpoints ----------
@api_router.post("/login")
async def titan_login(request: Request):
    """Encrypt + persist API credentials with Fernet (AES-128 CBC + HMAC SHA256)."""
    try:
        data = await request.json()
        for key in ('platform', 'api_key', 'api_secret', 'is_testnet'):
            if key not in data:
                return JSONResponse({"status": "error", "message": f"Missing field: {key}"}, status_code=400)

        creds = {
            "platform": data['platform'],
            "api_key": data['api_key'],
            "api_secret": data['api_secret'],
            "is_testnet": bool(data['is_testnet']),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        encrypted = cipher.encrypt(json.dumps(creds).encode())
        CRED_FILE.write_bytes(encrypted)

        env_label = 'testnet' if creds['is_testnet'] else 'production'
        return {"status": "success",
                "message": f"Credentials encrypted for {data['platform']} ({env_label})"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@api_router.get("/check-auth")
async def titan_check_auth():
    return {"authenticated": CRED_FILE.exists()}


@api_router.post("/logout")
async def titan_logout():
    """Securely delete encrypted credentials."""
    try:
        if CRED_FILE.exists():
            size = CRED_FILE.stat().st_size
            CRED_FILE.write_bytes(os.urandom(max(size, 64)))
            CRED_FILE.unlink()
        if COMMANDS_FILE.exists():
            try:
                COMMANDS_FILE.unlink()
            except OSError:
                pass
        return {"status": "success", "message": "Session terminated, credentials wiped"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@api_router.post("/command")
async def titan_command(request: Request):
    """Persist a command for the bot to consume."""
    try:
        cmd = await request.json()
        cmd["received_at"] = datetime.now(timezone.utc).isoformat()
        COMMANDS_FILE.write_text(json.dumps(cmd, indent=4))
        return {"status": "success", "message": "Command relayed to Titán"}
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
