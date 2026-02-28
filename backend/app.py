import sqlite3
import json
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import os

app = Flask(__name__)
CORS(app)

OPENF1_BASE_URL = "https://api.openf1.org/v1"
DB_FILE = "f1_cache.db"

def init_db():
    """Initialize the SQLite database for caching telemetry chunks."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # We store the raw JSON string of the API response to make caching ultra-fast
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS telemetry_cache (
            session_key INTEGER,
            driver_number INTEGER,
            start_time TEXT,
            end_time TEXT,
            data TEXT,
            PRIMARY KEY (session_key, driver_number, start_time, end_time)
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS car_data_cache (
            session_key INTEGER,
            driver_number INTEGER,
            start_time TEXT,
            end_time TEXT,
            data TEXT,
            PRIMARY KEY (session_key, driver_number, start_time, end_time)
        )
    ''')
    conn.commit()
    conn.close()

# Run this when the app starts
init_db()

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "OpenF1 Data Engine Running", "ready": True})

@app.route('/api/sessions/<int:year>', methods=['GET'])
def get_sessions(year):
    try:
        url = f"{OPENF1_BASE_URL}/sessions?year={year}&session_name=Race"
        response = requests.get(url)
        response.raise_for_status()
        return jsonify({"success": True, "data": response.json()})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/track/<int:session_key>', methods=['GET'])
def get_track_layout(session_key):
    try:
        url = f"{OPENF1_BASE_URL}/location?session_key={session_key}&driver_number=1"
        # Force requests to wait up to 60 seconds for the download
        response = requests.get(url, timeout=60) 
        response.raise_for_status()
        locations = response.json()
        
        # Extract coordinates
        track_coords = [{"x": loc["x"], "y": loc["y"]} for loc in locations if "x" in loc and "y" in loc]
        
        # DOWNSAMPLING: Keep only 1 out of every 20 data points. 
        # This reduces a 30,000 array down to 1,500, making the frontend lightning fast.
        track_coords = track_coords[::20] 
        
        return jsonify({"success": True, "data": track_coords})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/telemetry/chunk', methods=['GET'])
def get_telemetry_chunk():
    """
    Expects query params: session_key, driver_number, start_time, end_time
    Example times: 2023-04-02T05:00:00.000Z
    """
    session_key = request.args.get('session_key')
    driver_number = request.args.get('driver_number')
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')

    if not all([session_key, driver_number, start_time, end_time]):
        return jsonify({"success": False, "error": "Missing required parameters"}), 400

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 1. Check if we already have this exact chunk cached
    cursor.execute('''
        SELECT data FROM telemetry_cache 
        WHERE session_key=? AND driver_number=? AND start_time=? AND end_time=?
    ''', (session_key, driver_number, start_time, end_time))
    
    cached_row = cursor.fetchone()

    if cached_row:
        # Cache Hit! Return instantly.
        conn.close()
        return jsonify({"success": True, "source": "sqlite_cache", "data": json.loads(cached_row[0])})

    # 2. Cache Miss! Fetch from OpenF1
    try:
        url = f"{OPENF1_BASE_URL}/location?session_key={session_key}&driver_number={driver_number}&date>={start_time}&date<{end_time}"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        # 3. Save to SQLite for the next time
        cursor.execute('''
            INSERT INTO telemetry_cache (session_key, driver_number, start_time, end_time, data)
            VALUES (?, ?, ?, ?, ?)
        ''', (session_key, driver_number, start_time, end_time, json.dumps(data)))
        conn.commit()
        conn.close()

        return jsonify({"success": True, "source": "openf1_api", "data": data})

    except requests.exceptions.RequestException as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/drivers/<int:session_key>', methods=['GET'])
def get_drivers(session_key):
    """Fetch all drivers and their team colors for a specific session."""
    try:
        url = f"{OPENF1_BASE_URL}/drivers?session_key={session_key}"
        response = requests.get(url)
        response.raise_for_status()
        
        # The OpenF1 API returns multiple entries per driver sometimes (if they change helmets, etc.)
        # We will filter it down to unique driver numbers.
        drivers_data = response.json()
        unique_drivers = {}
        for d in drivers_data:
            if d.get("driver_number") not in unique_drivers:
                unique_drivers[d["driver_number"]] = {
                    "driver_number": d["driver_number"],
                    "name_acronym": d.get("name_acronym", "UNK"),
                    "team_color": f"#{d.get('team_colour', 'ffffff')}", # Default to white if missing
                    "full_name": d.get("full_name", "Unknown Driver")
                }
                
        return jsonify({"success": True, "data": list(unique_drivers.values())})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/car_data/chunk', methods=['GET'])
def get_car_data_chunk():
    """Fetch Speed, RPM, Throttle, and Brake data."""
    session_key = request.args.get('session_key')
    driver_number = request.args.get('driver_number')
    start_time = request.args.get('start_time')
    end_time = request.args.get('end_time')

    if not all([session_key, driver_number, start_time, end_time]):
        return jsonify({"success": False, "error": "Missing params"}), 400

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''SELECT data FROM car_data_cache WHERE session_key=? AND driver_number=? AND start_time=? AND end_time=?''', 
                   (session_key, driver_number, start_time, end_time))
    cached_row = cursor.fetchone()

    if cached_row:
        conn.close()
        return jsonify({"success": True, "source": "sqlite", "data": json.loads(cached_row[0])})

    try:
        url = f"{OPENF1_BASE_URL}/car_data?session_key={session_key}&driver_number={driver_number}&date>={start_time}&date<{end_time}"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()

        cursor.execute('''INSERT INTO car_data_cache (session_key, driver_number, start_time, end_time, data) VALUES (?, ?, ?, ?, ?)''', 
                       (session_key, driver_number, start_time, end_time, json.dumps(data)))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "source": "api", "data": data})
    except Exception as e:
        conn.close()
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)