from flask import Flask, request, jsonify, send_from_directory
import json
import os

# Create a Flask application.
# The static_folder is set to the current directory to serve all frontend files.
app = Flask(__name__)

# Define the path to the movies.json file
ROOT_DIR = os.path.dirname(os.path.realpath(__file__))
DATA_DIR = os.path.join(ROOT_DIR, 'data')
PORT = 5131
SERVER_VERSION = "1.5.0"

# Ensure the data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# API endpoint to get the server version
@app.route('/api/version', methods=['GET'])
def get_version():
    return jsonify({"server": SERVER_VERSION}), 200

# API endpoint to get the list of available years
@app.route('/api/years', methods=['GET'])
def get_years():
    try:
        year_lists = []
        filenames = [f for f in os.listdir(DATA_DIR) if f.endswith('.json')]
        
        for filename in filenames:
            try:
                file_path = os.path.join(DATA_DIR, filename)
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    year_lists.append({"id": filename.split('.')[0], "title": data.get("title", "Untitled")})
            except (json.JSONDecodeError, KeyError):
                continue # Skip malformed files
        year_lists.sort(key=lambda x: x['id'], reverse=True) # Show most recent years first
        return jsonify(year_lists), 200
    except Exception as e:
        print(f"Error reading years from data directory: {e}")
        return jsonify({"message": "Could not retrieve year list."}), 500

# API endpoint to create a new year list
@app.route('/api/years', methods=['POST'])
def create_year_list():
    try:
        data = request.get_json()
        year = data.get('year')

        if not year:
            return jsonify({"message": "Year is required."}), 400

        base_filename = str(year)
        filename = f"{base_filename}.json"
        file_path = os.path.join(DATA_DIR, filename)
        
        counter = 1
        while os.path.exists(file_path):
            filename = f"{base_filename}-{counter}.json"
            file_path = os.path.join(DATA_DIR, filename)
            counter += 1
        
        list_name = filename.split('.')[0]
        new_list_data = {
            "title": f"New List {list_name}",
            "movies": []
        }

        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(new_list_data, f, indent=4)
        return jsonify({"message": f"Successfully created list {list_name}", "newList": list_name}), 201
    except Exception as e:
        print(f"Error creating new list: {e}")
        return jsonify({"message": "Failed to create new list."}), 500

# API endpoint to get a movie list for a specific year
@app.route('/api/movies/<year>', methods=['GET'])
def get_movies(year):
    try:
        file_path = os.path.join(DATA_DIR, f"{year}.json")
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data), 200
    except FileNotFoundError:
        return jsonify({"title": f"New List {year}", "movies": []}), 200 # Return empty list if file doesn't exist
    except Exception as e:
        print(f"Error reading {year}.json: {e}")
        return jsonify({"message": f"Could not read movie list for {year}."}), 500

# API endpoint to update the movies.json file
@app.route('/api/movies', methods=['POST'])
def update_movies():
    try:
        data = request.get_json()
        year = data.get('year')
        title = data.get('title')
        movies = data.get('movies')

        if not year or title is None or not isinstance(movies, list):
            return jsonify({"message": "Invalid data format. Expected 'year', 'title', and a 'movies' array."}), 400

        file_path = os.path.join(DATA_DIR, f"{year}.json")
        data_to_write = json.dumps({"title": title, "movies": movies}, indent=4)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(data_to_write)

        return jsonify({"message": "Movie list updated successfully."}), 200

    except Exception as e:
        print(f"Error writing to movies.json: {e}")
        return jsonify({"message": "Failed to update movie list."}), 500

# API endpoint to delete a movie list for a specific year
@app.route('/api/movies/<year>', methods=['DELETE'])
def delete_movie_list(year):
    try:
        file_path = os.path.join(DATA_DIR, f"{year}.json")
        if os.path.exists(file_path):
            os.remove(file_path)
            return jsonify({"message": f"Movie list for {year} deleted successfully."}), 200
        else:
            return jsonify({"message": f"No movie list found for {year}."}), 404
    except Exception as e:
        print(f"Error deleting {year}.json: {e}")
        return jsonify({"message": f"Failed to delete movie list for {year}."}), 500

# A catch-all route to serve the frontend files.
# It serves index.html for the root path, and any other existing file for other paths.
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(ROOT_DIR, path)):
        return send_from_directory(ROOT_DIR, path)
    return send_from_directory(ROOT_DIR, 'index.html')

if __name__ == '__main__':
    print(f"Starting Python Flask server on http://localhost:{PORT}")
    app.run(port=PORT, debug=True)