#!/usr/bin/env python3

import sys
import os
import socket
import re
import subprocess
import hashlib
import logging
import json
from src.downloader import Downloader

# Configure logging
logging.basicConfig(
    level=logging.WARNING,  # Nur Warnungen und Fehler anzeigen
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

installpath = os.path.abspath(os.path.dirname(sys.argv[0]))
sys.path.append(installpath + '/python')

HOST = ''
PORT = 8282

for arg in sys.argv:
    arg_arr = arg.rsplit('=', 1)
    
    if len(arg_arr) == 2:
        if arg_arr[0] == "ip":
            HOST = arg_arr[1]
        elif arg_arr[0] == "port":
            try:
                PORT = int(arg_arr[1])
            except ValueError:
                logger.error(f"Invalid port number: {arg_arr[1]}")
                PORT = 8282

try:
    listen_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listen_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listen_socket.bind((HOST, PORT))
    listen_socket.listen(1)
except socket.error as e:
    logger.error(f"Socket error: {e}")
    sys.exit(1)

scriptPath = os.path.abspath(os.path.dirname(sys.argv[0]))  # script path
scriptParent = os.path.abspath(os.path.join(scriptPath, os.pardir))  # parent path

# Initialize SFDL Downloader
config_file = os.path.join(scriptPath, '.env')
status_file = os.path.join(scriptPath, 'static', 'status.json')
downloader = Downloader(config_file, status_file)

# Create initial status.json if it doesn't exist
downloader.update_status(status='idle', action='done', sfdl_name='')

# Load password hashes from config
def load_config_passwords():
    """Load and hash passwords from .env"""
    passwords = {}
    config_path = os.path.join(scriptPath, '.env')
    
    try:
        with open(config_path, 'r') as f:
            for line in f:
                line = line.strip()
                if 'START_PASSWORD=' in line:
                    pwd = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                    # Check if already hashed (64 char hex string)
                    if len(pwd) == 64 and all(c in '0123456789abcdef' for c in pwd.lower()):
                        passwords['start'] = pwd
                    else:
                        passwords['start'] = hashlib.sha256(pwd.encode()).hexdigest()
                elif 'STOP_PASSWORD=' in line:
                    pwd = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                    if len(pwd) == 64 and all(c in '0123456789abcdef' for c in pwd.lower()):
                        passwords['stop'] = pwd
                    else:
                        passwords['stop'] = hashlib.sha256(pwd.encode()).hexdigest()
                elif 'KILL_PASSWORD=' in line:
                    pwd = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                    if len(pwd) == 64 and all(c in '0123456789abcdef' for c in pwd.lower()):
                        passwords['kill'] = pwd
                    else:
                        passwords['kill'] = hashlib.sha256(pwd.encode()).hexdigest()
    except FileNotFoundError:
        logger.error(f"Config file not found: {config_path}")
        passwords = {
            'start': hashlib.sha256(b'startnow123').hexdigest(),
            'stop': hashlib.sha256(b'sdown').hexdigest(),
            'kill': hashlib.sha256(b'killnow').hexdigest()
        }
    
    return passwords

PASSWORD_HASHES = load_config_passwords()

def verify_password(password, password_type):
    """Verify password against stored hash"""
    if password_type not in PASSWORD_HASHES:
        return False
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    return password_hash == PASSWORD_HASHES[password_type]

if not HOST:
    print(f'✓ Webserver auf Port {PORT} gestartet!')
else:
    print(f'✓ Webserver mit IP {HOST} und Port {PORT} gestartet!')

def post_file(file, req):
    """Handle POST requests"""
    try:
        file = file.strip('/')
        file_split = file.rsplit('?', 1)
        file_only = file_split[0]
        
        if len(file_split) == 2:
            file_args = file_split[1]
        else:
            file_args = ""
        
        file_path = os.path.join(scriptPath, 'static', file_only)
        
        if os.path.isfile(file_path):
            file_ext = file_only.rsplit('.', 1)
            if len(file_ext) > 1:
                file_ext = file_ext[1]
            else:
                file_ext = ""
            
            if file_ext == "php":
                cmd = f'CONTENT_LENGTH=1000; php-cgi -c "{scriptPath}" "{scriptPath}/status/{file} {req}"'
                data = os.popen(cmd).read()
                output = "HTTP/1.1 200 OK\nContent-Type: application/octet-stream\n" + data
                return output.encode('utf-8')
        
        return b"HTTP/1.1 404 Not Found\r\n\r\n"
    
    except Exception as e:
        logger.error(f"Error in post_file: {e}")
        return b"HTTP/1.1 500 Internal Server Error\r\n\r\n"

def load_file(file):
    """Load and serve static files"""
    try:
        file = file.strip('/')
        file_split = file.rsplit('?', 1)
        file_only = file_split[0]
        
        if len(file_split) == 2:
            file_args = file_split[1]
        else:
            file_args = ""
        
        file_path = os.path.join(scriptPath, 'static', file_only)
        
        if os.path.isfile(file_path):
            file_ext_parts = file_only.rsplit('.', 1)
            if len(file_ext_parts) > 1:
                file_ext = file_ext_parts[1]
            else:
                file_ext = ""
            
            content_types = {
                "html": "text/html; charset=utf-8",
                "json": "application/json",
                "xml": "application/xml",
                "js": "application/javascript",
                "txt": "text/plain",
                "css": "text/css",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "gif": "image/gif",
                "woff": "application/x-font-woff",
                "ttf": "font/opentype"
            }
            
            content = content_types.get(file_ext, "application/octet-stream")
            
            if file_ext == "php":
                cmd = f'php-cgi -c "{scriptPath}" "{scriptPath}/status/{file}"'
                data = os.popen(cmd).read()
                output = "HTTP/1.1 200 OK\n" + data
            else:
                with open(file_path, 'r', encoding='utf-8') as htmlfile:
                    data = htmlfile.read()
                
                output = f"HTTP/1.1 200 OK\n{content}\r\n\n{data}"
            
            return output.encode('utf-8')
        
        else:
            error_response = """HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8\r\n
<html><head><title>404</title></head><body><h1>404 - Seite nicht gefunden!</h1></body></html>
"""
            return error_response.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error in load_file: {e}")
        error_response = """HTTP/1.1 500 Internal Server Error
Content-Type: text/html; charset=utf-8\r\n
<html><head><title>500</title></head><body><h1>500 - Interner Serverfehler!</h1></body></html>
"""
        return error_response.encode('utf-8')

def upload_sfdl(req):
    """Upload SFDL file to files directory"""
    try:
        # Extract boundary from Content-Type header
        boundary_match = re.search(r'boundary=([^\r\n]+)', req)
        if not boundary_match:
            error_data = {"error": "No boundary found in multipart request"}
            error_response = f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
            return error_response.encode('utf-8')
        
        boundary = boundary_match.group(1).strip()
        
        # Extract file content from multipart data
        parts = req.split(f'--{boundary}')
        
        filename = None
        file_content = None
        
        for part in parts:
            if 'Content-Disposition' in part and 'filename' in part:
                # Extract filename
                filename_match = re.search(r'filename="([^"]+)"', part)
                if filename_match:
                    filename = filename_match.group(1)
                    
                    # Extract content (after double newline)
                    content_start = part.find('\r\n\r\n')
                    if content_start != -1:
                        file_content = part[content_start+4:].strip()
                        # Remove trailing boundary markers
                        if file_content.endswith('--'):
                            file_content = file_content[:-2].strip()
                    break
        
        if not filename or not file_content:
            error_data = {"error": "No file uploaded"}
            error_response = f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
            return error_response.encode('utf-8')
        
        # Ensure .sfdl extension
        if not filename.endswith('.sfdl'):
            filename += '.sfdl'
        
        # Load files path from config
        files = os.path.join(scriptParent, 'uploads')
        if os.path.exists(os.path.join(scriptPath, '.env')):
            with open(os.path.join(scriptPath, '.env'), 'r') as f:
                for line in f:
                    if 'FILES_DIR=' in line:
                        # Remove comments and extract path
                        path = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                        # Replace $pwd with scriptParent
                        path = path.replace('$pwd', scriptParent)
                        if os.path.isabs(path):
                            files = path
                        break
        
        # Create directory if it doesn't exist
        os.makedirs(files, exist_ok=True)
        
        # Save file
        file_path = os.path.join(files, filename)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(file_content)
        
        print(f"✓ SFDL Datei hochgeladen: {filename} -> {file_path}")
        logger.info(f"SFDL file uploaded: {filename} to {file_path}")
        
        # Detect media type using TMDB
        media_type = 'unknown'
        try:
            # Parse SFDL to get decrypted name
            from src.downloader import Downloader
            config_path = os.path.join(scriptPath, '.env')
            status_file = os.path.join(scriptPath, 'static', 'status.json')
            downloader = Downloader(config_path, status_file)
            
            # Parse SFDL (handles decryption)
            sfdl_info = downloader.parse_sfdl(file_path)
            if sfdl_info and sfdl_info.get('name'):
                sfdl_name = sfdl_info['name']
            else:
                # Fallback to filename
                sfdl_name = filename.replace('.sfdl', '').replace('.', ' ').replace('_', ' ')
            
            # Detect media type
            media_info = downloader.detect_media_type(sfdl_name)
            if isinstance(media_info, dict):
                media_type = media_info.get('type', 'unknown')
            else:
                # Backwards compatibility
                media_type = media_info
                media_info = {'type': media_type}
            
            # Save metadata
            metadata_file = os.path.join(files, '.metadata.json')
            metadata = {}
            if os.path.exists(metadata_file):
                with open(metadata_file, 'r') as mf:
                    metadata = json.load(mf)
            
            metadata[filename] = media_info
            with open(metadata_file, 'w') as mf:
                json.dump(metadata, mf, indent=2)
            
            print(f"  Media Type detected: {media_type}")
        except Exception as e:
            logger.error(f"Error detecting media type: {e}")
        
        # Use json module for proper escaping
        response_data = {
            "success": True,
            "filename": filename,
            "path": file_path,
            "media_type": media_type,
            "media_info": media_info
        }
        
        output = f"""HTTP/1.1 200 OK
Content-Type: application/json\r\n

{json.dumps(response_data)}
"""
        return output.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error uploading SFDL: {e}")
        error_data = {"error": f"Failed to upload file: {str(e)}"}
        error_response = f"""HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
        return error_response.encode('utf-8')

def download_sfdl_url(req):
    """Download SFDL file from URL and save it"""
    try:
        # Parse JSON body
        body_start = req.find('\r\n\r\n')
        if body_start == -1:
            error_data = {"error": "No request body found"}
            return f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        body = req[body_start+4:].strip()
        try:
            data = json.loads(body)
            url = data.get('url', '').strip()
        except json.JSONDecodeError:
            error_data = {"error": "Invalid JSON in request body"}
            return f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        if not url:
            error_data = {"error": "No URL provided"}
            return f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        # Extract filename from URL
        # Format: https://download.sfdl.net/enc/489151;Name;hash.32283
        url_parts = url.split(';')
        if len(url_parts) >= 2:
            filename = url_parts[1].strip()
            if not filename.endswith('.sfdl'):
                filename += '.sfdl'
        else:
            # Fallback: use timestamp
            from datetime import datetime
            filename = f"downloaded_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sfdl"
        
        # Download the file
        import urllib.request
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                file_content = response.read().decode('utf-8')
        except Exception as e:
            error_data = {"error": f"Failed to download from URL: {str(e)}"}
            return f"""HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        # Load files path from config
        files = os.path.join(scriptParent, 'uploads')
        if os.path.exists(os.path.join(scriptPath, '.env')):
            with open(os.path.join(scriptPath, '.env'), 'r') as f:
                for line in f:
                    if 'FILES_DIR=' in line:
                        path = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                        path = path.replace('$pwd', scriptParent)
                        if os.path.isabs(path):
                            files = path
                        break
        
        # Create directory if it doesn't exist
        os.makedirs(files, exist_ok=True)
        
        # Save file
        file_path = os.path.join(files, filename)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(file_content)
        
        print(f"✓ SFDL von URL heruntergeladen: {filename} -> {file_path}")
        logger.info(f"SFDL downloaded from URL: {url} to {file_path}")
        
        # Detect media type using TMDB
        media_type = 'unknown'
        try:
            from src.downloader import Downloader
            config_path = os.path.join(scriptPath, '.env')
            status_file = os.path.join(scriptPath, 'static', 'status.json')
            downloader = Downloader(config_path, status_file)
            
            # Parse SFDL (handles decryption)
            sfdl_info = downloader.parse_sfdl(file_path)
            if sfdl_info and sfdl_info.get('name'):
                sfdl_name = sfdl_info['name']
            else:
                # Fallback to filename
                sfdl_name = filename.replace('.sfdl', '').replace('.', ' ').replace('_', ' ')
            
            media_info = downloader.detect_media_type(sfdl_name)
            if isinstance(media_info, dict):
                media_type = media_info.get('type', 'unknown')
            else:
                # Backwards compatibility
                media_type = media_info
                media_info = {'type': media_type}
            
            # Save metadata
            metadata_file = os.path.join(files, '.metadata.json')
            metadata = {}
            if os.path.exists(metadata_file):
                with open(metadata_file, 'r') as mf:
                    metadata = json.load(mf)
            
            metadata[filename] = media_info
            with open(metadata_file, 'w') as mf:
                json.dump(metadata, mf, indent=2)
            
            print(f"  Media Type detected: {media_type}")
        except Exception as e:
            logger.error(f"Error detecting media type: {e}")
        
        response_data = {
            "success": True,
            "filename": filename,
            "path": file_path,
            "media_type": media_type,
            "media_info": media_info
        }
        
        output = f"""HTTP/1.1 200 OK
Content-Type: application/json\r\n

{json.dumps(response_data)}
"""
        return output.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error downloading SFDL from URL: {e}")
        error_data = {"error": f"Failed to download from URL: {str(e)}"}
        error_response = f"""HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
        return error_response.encode('utf-8')

def update_media_type(req):
    """Update media type for a SFDL file"""
    try:
        # Parse JSON body
        body_start = req.find('\r\n\r\n')
        if body_start == -1:
            error_data = {"error": "No request body found"}
            return f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        body = req[body_start+4:].strip()
        try:
            data = json.loads(body)
            filename = data.get('filename', '').strip()
            media_type = data.get('media_type', '').strip()
        except json.JSONDecodeError:
            error_data = {"error": "Invalid JSON in request body"}
            return f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        if not filename or media_type not in ['movie', 'tv']:
            error_data = {"error": "Invalid filename or media_type"}
            return f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        # Load files path from config
        files = os.path.join(scriptParent, 'uploads')
        if os.path.exists(os.path.join(scriptPath, '.env')):
            with open(os.path.join(scriptPath, '.env'), 'r') as f:
                for line in f:
                    if 'FILES_DIR=' in line:
                        path = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                        path = path.replace('$pwd', scriptParent)
                        if os.path.isabs(path):
                            files = path
                        break
        
        # Update metadata
        metadata_file = os.path.join(files, '.metadata.json')
        metadata = {}
        if os.path.exists(metadata_file):
            with open(metadata_file, 'r') as mf:
                metadata = json.load(mf)
        
        metadata[filename] = {'media_type': media_type}
        with open(metadata_file, 'w') as mf:
            json.dump(metadata, mf, indent=2)
        
        print(f"✓ Media type updated: {filename} -> {media_type}")
        logger.info(f"Media type updated: {filename} to {media_type}")
        
        response_data = {
            "success": True,
            "filename": filename,
            "media_type": media_type
        }
        
        output = f"""HTTP/1.1 200 OK
Content-Type: application/json\r\n

{json.dumps(response_data)}
"""
        return output.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error updating media type: {e}")
        error_data = {"error": f"Failed to update media type: {str(e)}"}
        error_response = f"""HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
        return error_response.encode('utf-8')

def list_sfdl_files():
    """List all SFDL files in uploads directory"""
    try:
        # Load files path from config
        files_dir = os.path.join(scriptParent, 'uploads')
        if os.path.exists(os.path.join(scriptPath, '.env')):
            with open(os.path.join(scriptPath, '.env'), 'r') as f:
                for line in f:
                    if 'FILES_DIR=' in line:
                        path = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                        path = path.replace('$pwd', scriptParent)
                        if os.path.isabs(path):
                            files_dir = path
                        break
        
        # Load metadata
        metadata_file = os.path.join(files_dir, '.metadata.json')
        metadata = {}
        if os.path.exists(metadata_file):
            with open(metadata_file, 'r') as mf:
                metadata = json.load(mf)
        
        files = []
        if os.path.exists(files_dir):
            for filename in os.listdir(files_dir):
                if filename.endswith('.sfdl'):
                    filepath = os.path.join(files_dir, filename)
                    stat = os.stat(filepath)
                    
                    # Get all metadata for this file
                    file_metadata = metadata.get(filename, {})
                    media_type = file_metadata.get('type', file_metadata.get('media_type', 'unknown'))
                    
                    file_info = {
                        'name': filename,
                        'size': stat.st_size,
                        'modified': stat.st_mtime,
                        'path': filepath,
                        'media_type': media_type
                    }
                    
                    # Add extra metadata if available
                    if media_type == 'tv':
                        if 'seasons' in file_metadata:
                            file_info['seasons'] = file_metadata['seasons']
                        if 'episodes' in file_metadata:
                            file_info['episodes'] = file_metadata['episodes']
                    elif media_type == 'movie':
                        if 'year' in file_metadata:
                            file_info['year'] = file_metadata['year']
                    
                    files.append(file_info)
        
        # Sort by modified time (newest first)
        files.sort(key=lambda x: x['modified'], reverse=True)
        
        response_data = {
            'success': True,
            'files': files,
            'count': len(files),
            'directory': files_dir
        }
        
        output = f"""HTTP/1.1 200 OK
Content-Type: application/json\r\n

{json.dumps(response_data)}
"""
        return output.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error listing SFDL files: {e}")
        error_data = {"error": f"Failed to list files: {str(e)}"}
        error_response = f"""HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
        return error_response.encode('utf-8')

def delete_sfdl_file(req):
    """Delete a SFDL file from uploads directory"""
    try:
        # Parse JSON body from request
        body_start = req.find('\r\n\r\n')
        if body_start == -1:
            error_data = {"success": False, "error": "No request body found"}
            return f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
""".encode('utf-8')
        
        body = req[body_start+4:].strip()
        try:
            data = json.loads(body)
            filename = data.get('filename', '')
        except json.JSONDecodeError:
            error_data = {"success": False, "error": "Invalid JSON"}
            error_response = f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
            return error_response.encode('utf-8')
        
        if not filename:
            error_data = {"success": False, "error": "Filename required"}
            error_response = f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
            return error_response.encode('utf-8')
        
        # Security: Only allow .sfdl files and prevent directory traversal
        if not filename.endswith('.sfdl') or '/' in filename or '\\' in filename or '..' in filename:
            error_data = {"success": False, "error": "Invalid filename"}
            error_response = f"""HTTP/1.1 400 Bad Request
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
            return error_response.encode('utf-8')
        
        # Load files path from config
        files_dir = os.path.join(scriptParent, 'uploads')
        if os.path.exists(os.path.join(scriptPath, '.env')):
            with open(os.path.join(scriptPath, '.env'), 'r') as f:
                for line in f:
                    if 'FILES_DIR=' in line:
                        path = line.split('=', 1)[1].split('#')[0].strip().strip('"')
                        path = path.replace('$pwd', scriptParent)
                        if os.path.isabs(path):
                            files_dir = path
                        break
        
        filepath = os.path.join(files_dir, filename)
        
        # Check if file exists
        if not os.path.exists(filepath):
            error_data = {"success": False, "error": "File not found"}
            error_response = f"""HTTP/1.1 404 Not Found
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
            return error_response.encode('utf-8')
        
        # Delete the file
        os.remove(filepath)
        logger.info(f"Deleted SFDL file: {filename}")
        
        # Remove from metadata if exists
        metadata_file = os.path.join(files_dir, '.metadata.json')
        if os.path.exists(metadata_file):
            try:
                with open(metadata_file, 'r') as mf:
                    metadata = json.load(mf)
                
                if filename in metadata:
                    del metadata[filename]
                    
                with open(metadata_file, 'w') as mf:
                    json.dump(metadata, mf, indent=2)
            except Exception as e:
                logger.warning(f"Could not update metadata: {e}")
        
        response_data = {"success": True, "message": f"File {filename} deleted successfully"}
        output = f"""HTTP/1.1 200 OK
Content-Type: application/json\r\n

{json.dumps(response_data)}
"""
        return output.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error deleting SFDL file: {e}")
        error_data = {"success": False, "error": f"Failed to delete file: {str(e)}"}
        error_response = f"""HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{json.dumps(error_data)}
"""
        return error_response.encode('utf-8')

def start_loader(cmd):
    """Start with password verification"""
    try:
        logger.info(f'cmd: {cmd}')
        logger.info(f'scriptParent: {scriptParent}')

        password = None
        
        # Try path format: /start/password
        path_match = re.match(r'/start/([^?&\s]+)', cmd)
        if path_match:
            password = path_match.group(1)
        else:
            # Try query parameter format: /start?password=...
            password_match = re.search(r'password=([^&\s]+)', cmd)
            if password_match:
                password = password_match.group(1)
        
        if not password:
            error_response = """HTTP/1.1 401 Unauthorized
Content-Type: application/json\r\n

{ "data" : [ { "error": "Password required" } ] }
"""
            return error_response.encode('utf-8')
        
        if not verify_password(password, 'start'):
            error_response = """HTTP/1.1 403 Forbidden
Content-Type: application/json\r\n

{ "data" : [ { "error": "Invalid password" } ] }
"""
            logger.warning("Failed login attempt with invalid password")
            return error_response.encode('utf-8')
        
        # Start downloader
        success = downloader.start_async()
        
        if success:
            logger.info("Downloader started successfully")
            
            output = """HTTP/1.1 200 OK
Content-Type: application/json\r\n

{ "data" : [ { "version":"1.0", "start":"ok" } ] }
"""
            return output.encode('utf-8')
        else:
            error_response = """HTTP/1.1 409 Conflict
Content-Type: application/json\r\n

{ "data" : [ { "error": "Download already running" } ] }
"""
            return error_response.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error starting loader: {e}")
        error_response = """HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{ "data" : [ { "error": "Failed to start loader" } ] }
"""
        return error_response.encode('utf-8')

def shutdown_server(cmd):
    """Shutdown the webserver with password verification"""
    try:
        logger.info(f'Shutdown request: {cmd}')
        
        # Extract password from command - support both /shutdown/password and /shutdown?password=...
        password = None
        
        # Try path format: /shutdown/password
        path_match = re.match(r'/shutdown/([^?&\s]+)', cmd)
        if path_match:
            password = path_match.group(1)
        else:
            # Try query parameter format: /shutdown?password=...
            password_match = re.search(r'password=([^&\s]+)', cmd)
            if password_match:
                password = password_match.group(1)
        
        if not password:
            error_response = """HTTP/1.1 401 Unauthorized
Content-Type: application/json\r\n

{ "data" : [ { "error": "Password required" } ] }
"""
            return error_response.encode('utf-8')
        
        if not verify_password(password, 'kill'):
            error_response = """HTTP/1.1 403 Forbidden
Content-Type: application/json\r\n

{ "data" : [ { "error": "Invalid password" } ] }
"""
            logger.warning("Failed shutdown attempt with invalid password")
            return error_response.encode('utf-8')
        
        print('\n✓ Server wird heruntergefahren (Remote-Befehl)')
        logger.info("Server shutdown requested via API")
        
        output = """HTTP/1.1 200 OK
Content-Type: application/json\r\n

{ "data" : [ { "shutdown":"ok" } ] }
"""
        # Set global flag to stop server
        global server_running
        server_running = False
        
        return output.encode('utf-8')
    
    except Exception as e:
        logger.error(f"Error shutting down server: {e}")
        error_response = """HTTP/1.1 500 Internal Server Error
Content-Type: application/json\r\n

{ "data" : [ { "error": "Failed to shutdown server" } ] }
"""
        return error_response.encode('utf-8')

# Server running flag
server_running = True

listen_socket.listen(1)
print(f'Server läuft auf http://{HOST if HOST else "localhost"}:{PORT}/')

while server_running:
    try:
        client_connection, client_address = listen_socket.accept()
        logger.info(f"Connection from {client_address}")
        
        request = client_connection.recv(8192)
        if not request:
            client_connection.close()
            continue
            
        req = request.decode('utf-8', errors='ignore').strip()
        logger.debug(f'req: {req}')
        
        m = re.search(r'(GET|POST) (.*?) HTTP/1.[01]', req)
        if not m:
            logger.warning("Invalid HTTP request")
            client_connection.close()
            continue
            
        get_post = m.group(1).strip()
        cmd = m.group(2).strip()
        
        logger.info(f'Method: {get_post} | Path: {cmd}')

        if not cmd or cmd == "/" or cmd == "/index.html":
            http_response = load_file('index.html')
        elif cmd == "/status" or cmd == "/status/" or cmd == "/status.json":
            http_response = load_file('status.json')
        elif cmd == "/files" or cmd == "/files.json":
            http_response = list_sfdl_files()
        elif cmd.startswith('/start'):
            http_response = start_loader(cmd)
        elif cmd.startswith('/shutdown'):
            http_response = shutdown_server(cmd)
            client_connection.sendall(http_response)
            client_connection.close()
            # Only break if shutdown was successful (check response)
            if b'"shutdown":"ok"' in http_response:
                break  # Exit main loop to shutdown server
            continue  # Don't send response again if password was wrong
        elif cmd == "/upload" and get_post == "POST":
            # Receive full request with body
            body = client_connection.recv(65536)
            full_req = req + '\r\n' + body.decode('utf-8', errors='ignore')
            http_response = upload_sfdl(full_req)
        elif cmd == "/download_sfdl_url" and get_post == "POST":
            # Download SFDL from URL
            http_response = download_sfdl_url(req)
        elif cmd == "/update_media_type" and get_post == "POST":
            # Update media type manually
            http_response = update_media_type(req)
        elif cmd == "/delete_sfdl" and get_post == "POST":
            # Delete SFDL file
            http_response = delete_sfdl_file(req)
        elif get_post == "POST":
            http_response = post_file(cmd, req)
        else:
            http_response = load_file(cmd)

        client_connection.sendall(http_response)
        
    except KeyboardInterrupt:
        print('\n✓ Server wurde beendet')
        break
    except Exception as e:
        logger.error(f"Error handling request: {e}")
    finally:
        try:
            client_connection.close()
        except:
            pass

print('✓ Server gestoppt')
try:
    listen_socket.close()
except:
    pass
