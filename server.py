from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os, json, time

app = Flask(__name__, static_folder="public")
CORS(app)

# Simple JSON storage - replace with your DB if you get am
ADS_FILE = "ads.json"
PUBLISHERS_FILE = "publishers.json"

def load(f, default):
    if not os.path.exists(f): return default
    try:
        with open(f) as x: return json.load(x)
    except: return default

def save(f, data):
    with open(f, "w") as x: json.dump(data, x, indent=2)

# --- Publisher: Get ads from pool ---
@app.route("/api/publisher/ads")
def publisher_ads():
    pcode = request.args.get("pcode")
    api_key = request.args.get("api_key")
    publishers = load(PUBLISHERS_FILE, {"p1": {"api_key": "AP-2118E216F03D", "approved": True}})
    pub = publishers.get(pcode)
    if not pub:
        return jsonify({"ok": False, "error": "Publisher not found"}), 404
    if pub.get("api_key") != api_key:
        return jsonify({"ok": False, "error": "Invalid api_key"}), 401
    if not pub.get("approved"):
        return jsonify({"ok": False, "error": "Publisher not approved yet"}), 403
    ads = load(ADS_FILE, [])
    # Only published ads
    published = [a for a in ads if a.get("status") == "published"]
    return jsonify(published)

# --- Publisher: Reward callback ---
@app.route("/api/publisher/view", methods=["POST"])
def publisher_view():
    data = request.get_json(force=True) or {}
    pcode = data.get("pcode")
    api_key = data.get("api_key")
    ad_id = data.get("ad_id")
    viewer_id = data.get("viewer_id")
    publishers = load(PUBLISHERS_FILE, {"p1": {"api_key": "AP-2118E216F03D", "approved": True}})
    pub = publishers.get(pcode)
    if not pub or pub.get("api_key") != api_key:
        return jsonify({"ok": False, "error": "Invalid pcode or api_key"}), 401
    if not pub.get("approved"):
        return jsonify({"ok": False, "error": "Publisher not approved yet"}), 403
    if not ad_id or not viewer_id:
        return jsonify({"ok": False, "error": "Missing ad_id or viewer_id"}), 400
    # Here: credit $0.005 to publisher earnings + log view
    # For demo: return success
    return jsonify({"ok": True, "rewarded": 0.005, "pcode": pcode, "ad_id": ad_id, "viewer_id": viewer_id, "timestamp": int(time.time())})

# --- Serve static files ---
@app.route("/")
def index():
    return send_from_directory("public", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("public", path)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
