"""
TITÁN TERMINAL — Flask Server
Serves the redesigned dashboard, handles encrypted authentication
and command relay between the web UI and the trading bot.
"""

from flask import Flask, request, send_from_directory, jsonify
from datetime import datetime
import json
import os
from cryptography.fernet import Fernet

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_DIR = os.path.join(BASE_DIR, 'dashboard')
CREDENTIALS_DIR = os.path.join(BASE_DIR, 'credentials')

os.makedirs(CREDENTIALS_DIR, exist_ok=True)
os.makedirs(DASHBOARD_DIR, exist_ok=True)

KEY_FILE = os.path.join(CREDENTIALS_DIR, 'secret.key')
CRED_FILE = os.path.join(CREDENTIALS_DIR, 'encrypted_credentials.bin')

# Initialise / load Fernet master key
if not os.path.exists(KEY_FILE):
    with open(KEY_FILE, 'wb') as f:
        f.write(Fernet.generate_key())
with open(KEY_FILE, 'rb') as f:
    cipher = Fernet(f.read())


# ---------------------- PAGES ----------------------
@app.route('/')
def index():
    """Serve login if no credentials, otherwise serve the main dashboard."""
    if not os.path.exists(CRED_FILE):
        return send_from_directory(DASHBOARD_DIR, 'login.html')
    return send_from_directory(DASHBOARD_DIR, 'index.html')


@app.route('/login')
def login_page():
    return send_from_directory(DASHBOARD_DIR, 'login.html')


@app.route('/<path:path>')
def static_files(path):
    """Serve any static asset from the dashboard directory."""
    return send_from_directory(DASHBOARD_DIR, path)


# ---------------------- API ----------------------
@app.route('/api/login', methods=['POST'])
def login():
    """Encrypt + persist API credentials with Fernet (AES-128 CBC + HMAC SHA256)."""
    try:
        data = request.get_json(force=True)
        required = ('platform', 'api_key', 'api_secret', 'is_testnet')
        if not all(k in data for k in required):
            return jsonify({"status": "error", "message": "Missing required fields"}), 400

        creds = {
            "platform": data['platform'],
            "api_key": data['api_key'],
            "api_secret": data['api_secret'],
            "is_testnet": bool(data['is_testnet']),
            "timestamp": datetime.utcnow().isoformat()
        }

        encrypted = cipher.encrypt(json.dumps(creds).encode())
        with open(CRED_FILE, 'wb') as f:
            f.write(encrypted)

        return jsonify({
            "status": "success",
            "message": f"Credentials encrypted for {data['platform']} ({'testnet' if creds['is_testnet'] else 'production'})"
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/check-auth')
def check_auth():
    return jsonify({"authenticated": os.path.exists(CRED_FILE)})


@app.route('/api/logout', methods=['POST'])
def logout():
    """Securely delete encrypted credentials and any pending commands."""
    try:
        if os.path.exists(CRED_FILE):
            # Overwrite with random bytes before unlinking (best-effort secure wipe)
            size = os.path.getsize(CRED_FILE)
            with open(CRED_FILE, 'wb') as f:
                f.write(os.urandom(max(size, 64)))
            os.remove(CRED_FILE)

        commands_file = os.path.join(DASHBOARD_DIR, 'commands.json')
        if os.path.exists(commands_file):
            try:
                os.remove(commands_file)
            except OSError:
                pass

        return jsonify({"status": "success", "message": "Session terminated, credentials wiped"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/command', methods=['POST'])
def handle_command():
    """Persist a command for the bot to consume via commands.json."""
    try:
        cmd = request.get_json(force=True) or {}
        cmd["received_at"] = datetime.utcnow().isoformat()
        with open(os.path.join(DASHBOARD_DIR, 'commands.json'), 'w') as f:
            json.dump(cmd, f, indent=4)
        return jsonify({"status": "success", "message": "Command relayed to Titán"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    print("=" * 60)
    print(" TITÁN TERMINAL — Dashboard Server")
    print(" http://localhost:5000")
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=False)
