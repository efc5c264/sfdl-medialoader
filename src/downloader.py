#!/usr/bin/env python3
"""
Downloader Module - Handles parsing and downloading of SFDL files
"""

import xml.etree.ElementTree as ET
import os
import ftplib
import hashlib
import threading
import time
import json
import base64
import re
import subprocess
from datetime import datetime
from urllib.parse import urlparse

try:
    from Crypto.Cipher import AES
    HAS_CRYPTO = True
except ImportError:
    try:
        from Cryptodome.Cipher import AES
        HAS_CRYPTO = True
    except ImportError:
        HAS_CRYPTO = False
        print("Warning: pycryptodome not installed. Encrypted SFDLs won't work!")
        print("Install with: pip install pycryptodome")
        print("Or on Debian/Ubuntu: apt install python3-pycryptodome")


class Downloader:
    def __init__(self, config_path, status_file):
        self.config_path = config_path
        self.status_file = status_file
        self.config = self.load_config()
        self.current_download = None
        self.download_thread = None
        self.is_downloading = False
        self.total_files = 0
        self.downloaded_files = 0
        self.total_bytes = 0
        self.downloaded_bytes = 0
        self.current_files = []
        self.download_speed = 0
        self.start_time = None
        self.passwords = self.load_passwords()
        
    def load_passwords(self):
        """Load password list for encrypted SFDL files"""
        passwords = []
        
        # Try to load from passwords.txt in project root
        script_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        password_file = os.path.join(script_path, 'passwords.txt')
        
        if os.path.exists(password_file):
            try:
                with open(password_file, 'r', encoding='utf-8', errors='ignore') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            passwords.append(line)
            except Exception as e:
                print(f"Error loading passwords: {e}")
        
        return passwords
    
    def extract_archives(self, directory, sfdl_name=''):
        """Extract RAR and TAR archives in the given directory"""
        if not self.config.get('extract_archives', True):
            print("  Archive extraction disabled in config")
            return
        
        try:
            print(f"\n  Checking for archives in: {directory}")
            
            # Find all archive files
            rar_files = []
            tar_files = []
            
            for root, dirs, files in os.walk(directory):
                for filename in files:
                    filepath = os.path.join(root, filename)
                    lower_name = filename.lower()
                    
                    # RAR files (only .rar, not .r00, .r01 etc - those are parts)
                    if lower_name.endswith('.rar') and not re.search(r'\.r\d+$', lower_name):
                        rar_files.append(filepath)
                    # TAR files (including .tar.gz, .tar.bz2, .tgz)
                    elif lower_name.endswith(('.tar', '.tar.gz', '.tar.bz2', '.tgz', '.tbz')):
                        tar_files.append(filepath)
            
            if not rar_files and not tar_files:
                print("  No archives found")
                return
            
            total_archives = len(rar_files) + len(tar_files)
            print(f"  Found {len(rar_files)} RAR and {len(tar_files)} TAR archives")
            
            current_archive = 0
            
            # Extract RAR files
            for rar_file in rar_files:
                try:
                    current_archive += 1
                    archive_name = os.path.basename(rar_file)
                    print(f"  Extracting RAR ({current_archive}/{total_archives}): {archive_name}")
                    
                    # Update status
                    self.update_status(
                        status='running',
                        action=f'Entpacke Archive ({current_archive}/{total_archives}): {archive_name}',
                        sfdl_name=sfdl_name
                    )
                    
                    extract_dir = os.path.dirname(rar_file)
                    
                    # Try to find unrar command
                    unrar_cmd = 'unrar'
                    if not self._command_exists('unrar'):
                        # Try alternative paths
                        script_dir = os.path.dirname(os.path.abspath(__file__))
                        for unrar_path in [
                            os.path.join(script_dir, 'unrar'),
                            '/usr/bin/unrar',
                            '/usr/local/bin/unrar'
                        ]:
                            if os.path.exists(unrar_path):
                                unrar_cmd = unrar_path
                                break
                    
                    # Extract with unrar
                    cmd = [unrar_cmd, 'x', '-o+', rar_file, extract_dir + '/']
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                    
                    if result.returncode == 0:
                        print(f"    ✓ Extracted successfully")
                        
                        # Remove archive if configured
                        if self.config.get('remove_archives', True):
                            os.remove(rar_file)
                            print(f"    ✓ Removed archive")
                            
                            # Remove .r00, .r01 etc parts
                            base_name = rar_file[:-4]  # Remove .rar
                            for i in range(100):
                                part_file = f"{base_name}.r{i:02d}"
                                if os.path.exists(part_file):
                                    os.remove(part_file)
                                    print(f"    ✓ Removed part: {os.path.basename(part_file)}")
                    else:
                        print(f"    ✗ Extraction failed: {result.stderr}")
                        
                except Exception as e:
                    print(f"    ✗ Error extracting {os.path.basename(rar_file)}: {e}")
            
            # Extract TAR files
            for tar_file in tar_files:
                try:
                    current_archive += 1
                    archive_name = os.path.basename(tar_file)
                    print(f"  Extracting TAR ({current_archive}/{total_archives}): {archive_name}")
                    
                    # Update status
                    self.update_status(
                        status='running',
                        action=f'Entpacke Archive ({current_archive}/{total_archives}): {archive_name}',
                        sfdl_name=sfdl_name
                    )
                    
                    extract_dir = os.path.dirname(tar_file)
                    
                    import tarfile
                    with tarfile.open(tar_file, 'r:*') as tar:
                        tar.extractall(path=extract_dir)
                    
                    print(f"    ✓ Extracted successfully")
                    
                    # Remove archive if configured
                    if self.config.get('remove_archives', True):
                        os.remove(tar_file)
                        print(f"    ✓ Removed archive")
                        
                except Exception as e:
                    print(f"    ✗ Error extracting {os.path.basename(tar_file)}: {e}")
            
            print("  ✓ Archive extraction completed")
            
        except Exception as e:
            print(f"Error in extract_archives: {e}")
            import traceback
            traceback.print_exc()
    
    def cleanup_unwanted_files(self, directory, sfdl_name=''):
        """Remove unwanted files and folders before extraction"""
        try:
            print(f"\n  Cleaning up unwanted files in: {directory}")
            
            # Update status
            self.update_status(
                status='running',
                action='Bereinige unerwünschte Dateien...',
                sfdl_name=sfdl_name
            )
            
            removed_count = 0
            unwanted_folders = ['proof', 'sample', 'subs']
            
            # Walk through directory (bottom-up to handle folder deletion)
            for root, dirs, files in os.walk(directory, topdown=False):
                # Remove unwanted files
                for filename in files:
                    filepath = os.path.join(root, filename)
                    lower_name = filename.lower()
                    should_remove = False
                    reason = ""
                    
                    # Check for .jpg files
                    if lower_name.endswith('.jpg'):
                        should_remove = True
                        reason = "JPG"
                    
                    # Check for .nfo files
                    elif lower_name.endswith('.nfo'):
                        should_remove = True
                        reason = "NFO"
                    
                    # Check for .sub files
                    elif lower_name.endswith('.sub'):
                        should_remove = True
                        reason = "SUB"
                    
                    # Check for .idx files
                    elif lower_name.endswith('.idx'):
                        should_remove = True
                        reason = "IDX"
                    
                    # Check for -sample in filename (with hyphen)
                    elif '-sample' in lower_name:
                        should_remove = True
                        reason = "sample file"
                    
                    if should_remove:
                        try:
                            os.remove(filepath)
                            print(f"    ✓ Removed {reason}: {filename}")
                            removed_count += 1
                        except Exception as e:
                            print(f"    ✗ Error removing {filename}: {e}")
                
                # Remove unwanted folders
                for dirname in dirs[:]:  # Use slice to modify during iteration
                    if dirname.lower() in unwanted_folders:
                        dirpath = os.path.join(root, dirname)
                        try:
                            import shutil
                            shutil.rmtree(dirpath)
                            print(f"    ✓ Removed folder: {dirname}")
                            removed_count += 1
                            dirs.remove(dirname)  # Prevent walking into deleted dir
                        except Exception as e:
                            print(f"    ✗ Error removing folder {dirname}: {e}")
            
            if removed_count > 0:
                print(f"  ✓ Cleanup completed - {removed_count} item(s) removed")
            else:
                print("  ✓ No unwanted files found")
            
        except Exception as e:
            print(f"Error in cleanup_unwanted_files: {e}")
            import traceback
            traceback.print_exc()
    
    def detect_media_type(self, name):
        """Detect if content is a movie or TV series using TMDB API"""
        try:
            api_key = self.config.get('tmdb_api_key', '')
            if not api_key:
                print("  TMDB API key not configured, skipping media detection")
                return 'unknown'
            
            # Check if year is present in original name
            import re
            year_match = re.search(r'\b(19\d{2}|20\d{2})\b', name)
            has_year = year_match is not None
            year = year_match.group(1) if year_match else None
            
            # Check if it's a TV series (has season/episode markers)
            is_tv_series = bool(re.search(r'\bS\d{1,2}(E\d{1,2})?\b', name, flags=re.IGNORECASE))
            
            # Clean the name for search (remove common patterns)
            clean_name = name
            
            # Replace dots/underscores with spaces first
            clean_name = clean_name.replace('.', ' ').replace('_', ' ')
            
            # Remove year
            clean_name = re.sub(r'\b(19|20)\d{2}\b', '', clean_name)
            
            # Remove season and episode information (S01, S02, S01E01, etc.)
            clean_name = re.sub(r'\bS\d{1,2}(E\d{1,2})?\b', '', clean_name, flags=re.IGNORECASE)
            
            # Remove language tags
            clean_name = re.sub(r'\b(German|English|GERMAN|ENGLISH|Deutsch|Multi|MULTi|DL|ML)\b', '', clean_name, flags=re.IGNORECASE)
            
            # Remove quality and codec indicators (including streaming platforms, audio/video tags)
            clean_name = re.sub(r'\b(1080p|720p|2160p|4K|UHD|BluRay|BDRip|BDRiP|WEB-DL|WEBRip|WEB|HDTV|DVDRip|x264|x265|h264|h265|HEVC|AVC|AAC|DTS|AC3|Atmos|ATVP|NF|AMZN|DSNP|HMAX|HULU|PCOK|PMTP|STAN|iP|DSCP|CR|DD5\.1|DD|TrueHD|DTS-HD|FLAC|Opus|HDR|HDR10|HDR10\+|DV|SDR|REMUX|HYBRID|Retail|SUBBED|DUBBED|DiRFiX|COMPLETE|READ\.NFO|FS|WS)\b', '', clean_name, flags=re.IGNORECASE)
            
            # Remove release groups (pattern: -GROUPNAME at end)
            clean_name = re.sub(r'-[A-Za-z0-9]+\s*$', '', clean_name)
            
            # Remove common scene tags
            clean_name = re.sub(r'\b(REPACK|PROPER|iNTERNAL|LIMITED|UNRATED|DC|EXTENDED|REMASTERED)\b', '', clean_name, flags=re.IGNORECASE)
            
            # Clean up extra spaces
            clean_name = ' '.join(clean_name.split()).strip()
            
            if year:
                print(f"  Searching TMDB for: '{clean_name}' (Year: {year})")
            else:
                print(f"  Searching TMDB for: '{clean_name}'")
            
            import urllib.request
            import urllib.parse
            import json
            
            # Prioritize TV series search if season/episode markers are present
            if is_tv_series:
                # Try TV series search first
                search_url = f"https://api.themoviedb.org/3/search/tv?query={urllib.parse.quote(clean_name)}&language=de"
                if year:
                    search_url += f"&first_air_date_year={year}"
                
                try:
                    request = urllib.request.Request(search_url)
                    request.add_header('Authorization', f'Bearer {api_key}')
                    request.add_header('accept', 'application/json')
                    
                    response = urllib.request.urlopen(request, timeout=10)
                    data = json.loads(response.read().decode('utf-8'))
                    
                    if data.get('results') and len(data['results']) > 0:
                        tv_result = data['results'][0]
                        tv_id = tv_result.get('id')
                        tv_year = tv_result.get('first_air_date', '')[:4] if tv_result.get('first_air_date') else ''
                        print(f"    ✓ Found TV Series: {tv_result.get('name', 'Unknown')} ({tv_year})")
                        
                        # Get detailed TV info for number of seasons and episodes
                        details_url = f"https://api.themoviedb.org/3/tv/{tv_id}?language=de"
                        try:
                            detail_request = urllib.request.Request(details_url)
                            detail_request.add_header('Authorization', f'Bearer {api_key}')
                            detail_request.add_header('accept', 'application/json')
                            detail_response = urllib.request.urlopen(detail_request, timeout=10)
                            detail_data = json.loads(detail_response.read().decode('utf-8'))
                            
                            seasons = detail_data.get('number_of_seasons', 0)
                            episodes = detail_data.get('number_of_episodes', 0)
                            series_name = detail_data.get('name', tv_result.get('name', 'Unknown'))
                            print(f"      Staffeln: {seasons}, Episoden: {episodes}")
                            
                            return {
                                'type': 'tv',
                                'seasons': seasons,
                                'episodes': episodes,
                                'name': series_name,
                                'year': tv_year
                            }
                        except Exception as e:
                            print(f"      Details error: {e}")
                            return {'type': 'tv', 'name': tv_result.get('name', 'Unknown'), 'year': tv_year}
                except Exception as e:
                    print(f"    TV search error: {e}")
            
            # If year found in filename and not a TV series, prioritize movie search
            elif has_year:
                # Try movie search first
                movie_url = f"https://api.themoviedb.org/3/search/movie?query={urllib.parse.quote(clean_name)}&language=de"
                if year:
                    movie_url += f"&year={year}"
                
                try:
                    request = urllib.request.Request(movie_url)
                    request.add_header('Authorization', f'Bearer {api_key}')
                    request.add_header('accept', 'application/json')
                    
                    response = urllib.request.urlopen(request, timeout=10)
                    data = json.loads(response.read().decode('utf-8'))
                    
                    if data.get('results') and len(data['results']) > 0:
                        result = data['results'][0]
                        movie_year = result.get('release_date', '')[:4] if result.get('release_date') else ''
                        print(f"    ✓ Found Movie: {result.get('title', 'Unknown')} ({movie_year})")
                        return {
                            'type': 'movie',
                            'year': movie_year,
                            'name': result.get('title', 'Unknown')
                        }
                except Exception as e:
                    print(f"    Movie search error: {e}")
            
            # Try TV series search as fallback (without year filter if initial search failed)
            search_url = f"https://api.themoviedb.org/3/search/tv?query={urllib.parse.quote(clean_name)}&language=de"
            
            try:
                request = urllib.request.Request(search_url)
                request.add_header('Authorization', f'Bearer {api_key}')
                request.add_header('accept', 'application/json')
                
                response = urllib.request.urlopen(request, timeout=10)
                data = json.loads(response.read().decode('utf-8'))
                
                if data.get('results') and len(data['results']) > 0:
                    tv_result = data['results'][0]
                    tv_id = tv_result.get('id')
                    tv_year = tv_result.get('first_air_date', '')[:4] if tv_result.get('first_air_date') else ''
                    print(f"    ✓ Found TV Series: {tv_result.get('name', 'Unknown')} ({tv_year})")
                    
                    # Get detailed TV info for number of seasons and episodes
                    details_url = f"https://api.themoviedb.org/3/tv/{tv_id}?language=de"
                    try:
                        detail_request = urllib.request.Request(details_url)
                        detail_request.add_header('Authorization', f'Bearer {api_key}')
                        detail_request.add_header('accept', 'application/json')
                        detail_response = urllib.request.urlopen(detail_request, timeout=10)
                        detail_data = json.loads(detail_response.read().decode('utf-8'))
                        
                        seasons = detail_data.get('number_of_seasons', 0)
                        episodes = detail_data.get('number_of_episodes', 0)
                        series_name = detail_data.get('name', tv_result.get('name', 'Unknown'))
                        print(f"      Staffeln: {seasons}, Episoden: {episodes}")
                        
                        return {
                            'type': 'tv',
                            'seasons': seasons,
                            'episodes': episodes,
                            'name': series_name,
                            'year': tv_year
                        }
                    except Exception as e:
                        print(f"      Details error: {e}")
                        return {'type': 'tv', 'name': tv_result.get('name', 'Unknown'), 'year': tv_year}
            except Exception as e:
                print(f"    TV search error: {e}")
            
            # Try movie search as fallback (only if year was not in filename or not a TV series)
            if not has_year or not is_tv_series:
                search_url = f"https://api.themoviedb.org/3/search/movie?query={urllib.parse.quote(clean_name)}&language=de"
                if year:
                    search_url += f"&year={year}"
                
                try:
                    request = urllib.request.Request(search_url)
                    request.add_header('Authorization', f'Bearer {api_key}')
                    request.add_header('accept', 'application/json')
                    
                    response = urllib.request.urlopen(request, timeout=10)
                    data = json.loads(response.read().decode('utf-8'))
                    
                    if data.get('results') and len(data['results']) > 0:
                        movie_result = data['results'][0]
                        release_date = movie_result.get('release_date', '')
                        movie_year = release_date[:4] if release_date else ''
                        movie_name = movie_result.get('title', 'Unknown')
                        print(f"    ✓ Found Movie: {movie_name} ({movie_year})")
                        
                        return {
                            'type': 'movie',
                            'year': movie_year,
                            'name': movie_name
                        }
                except Exception as e:
                    print(f"    Movie search error: {e}")
            
            print("  ⚠ No TMDB match found")
            return 'unknown'
            
        except Exception as e:
            print(f"Error detecting media type: {e}")
            return 'unknown'
    
    def _command_exists(self, command):
        """Check if a command exists in PATH"""
        try:
            import shutil
            return shutil.which(command) is not None
        except:
            return False
    
    def aes128cbc_decrypt(self, password, encrypted_base64):
        """Decrypt AES-128-CBC encrypted data (like bash aes128cbc function)"""
        if not HAS_CRYPTO:
            return None
            
        try:
            # MD5 hash of password as key
            key = hashlib.md5(password.encode()).digest()
            
            # Decode base64
            encrypted_data = base64.b64decode(encrypted_base64)
            
            # First 16 bytes are IV
            iv = encrypted_data[:16]
            
            # Decrypt
            cipher = AES.new(key, AES.MODE_CBC, iv)
            decrypted = cipher.decrypt(encrypted_data)
            
            # Remove first 16 bytes and padding (like tail -c +17)
            decrypted = decrypted[16:]
            
            # Remove PKCS7 padding
            padding_length = decrypted[-1]
            if isinstance(padding_length, int) and padding_length < 16:
                decrypted = decrypted[:-padding_length]
            
            # Decode to string
            result = decrypted.decode('utf-8', errors='ignore')
            
            # Remove null bytes and control characters
            result = result.replace('\x00', '')
            result = ''.join(char for char in result if char.isprintable() or char in '\n\r\t')
            
            # Strip whitespace and zero-width characters
            result = result.strip()
            result = re.sub(r'[\u200b-\u200f\ufeff]', '', result)
            
            return result
            
        except Exception as e:
            return None
    
    def bruteforce_decrypt(self, encrypted_value):
        """Try multiple passwords to decrypt value and return the working password"""
        import sys
        print(f"    bruteforce_decrypt: Testing {len(self.passwords)} passwords")
        sys.stdout.flush()
        
        for password in self.passwords:
            # Skip empty password
            if not password:
                continue
                
            result = self.aes128cbc_decrypt(password, encrypted_value)
            if result:
                print(f"    Testing '{password}' -> '{result[:30]}...'")
                sys.stdout.flush()
                # Check if result looks valid (contains printable characters)
                try:
                    # Valid if it contains dots (like IPs/domains) or slashes (paths) or @ (usernames)
                    # or is alphanumeric with common separators
                    if len(result) > 0 and (
                        '.' in result or 
                        '/' in result or 
                        '@' in result or
                        (result.replace('_', '').replace('-', '').replace('.', '').isalnum() and len(result) > 5)
                    ):
                        print(f"    ✓ Password '{password}' works!")
                        sys.stdout.flush()
                        return password  # Return the PASSWORD, not the result
                except:
                    pass
        
        print(f"    ✗ None of the passwords worked")
        sys.stdout.flush()
        return None
        
    def load_config(self):
        """Load configuration from .env file"""
        config = {
            'files': '',
            'downloads': '',
            'max_threads': 3,
            'extract_archives': True,
            'remove_archives': True,
            'tmdb_api_key': ''
        }
        
        try:
            env_path = os.path.join(os.path.dirname(self.config_path), '.env')
            script_dir = os.path.dirname(os.path.abspath(__file__))
            
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('#') or '=' not in line or not line:
                        continue
                    
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    
                    # Replace $pwd with script directory
                    value = value.replace('$pwd', script_dir)
                    
                    if key == 'FILES_DIR':
                        config['files'] = value
                    elif key == 'DOWNLOADS_DIR':
                        config['downloads'] = value
                    elif key == 'MAX_THREADS':
                        config['max_threads'] = int(value)
                    elif key == 'EXTRACT_ARCHIVES':
                        config['extract_archives'] = value.lower() == 'true'
                    elif key == 'REMOVE_ARCHIVES':
                        config['remove_archives'] = value.lower() == 'true'
                    elif key == 'TMDB_API_KEY':
                        config['tmdb_api_key'] = value
        except Exception as e:
            print(f"Error loading config: {e}")
        
        return config
    
    def parse_sfdl(self, sfdl_path):
        """Parse SFDL file and extract download information"""
        try:
            # Try XML parsing first
            try:
                tree = ET.parse(sfdl_path)
                root = tree.getroot()
                return self._parse_sfdl_xml(root, sfdl_path)
            except ET.ParseError as e:
                # Fall back to regex-based parsing if XML parsing fails
                print(f"XML parsing failed ({e}), using regex fallback")
                return self._parse_sfdl_regex(sfdl_path)
                
        except Exception as e:
            print(f"Error parsing SFDL: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _parse_sfdl_xml(self, root, sfdl_path):
        """Parse SFDL using XML parser"""
        info = {
            'name': '',
            'uploader': '',
            'host': '',
            'port': 21,
            'username': 'anonymous',
            'password': 'anonymous@anonymous.nix',
            'encrypted': False,
            'auth_required': False,
            'max_threads': 3,
            'files': [],
            'bulk_mode': False,
            'bulk_paths': []
        }
        
        # Extract metadata
        for elem in root.iter():
            if elem.tag == 'Description' and elem.text:
                info['name'] = elem.text.strip()
            elif elem.tag == 'Uploader' and elem.text:
                info['uploader'] = elem.text.strip()
            elif elem.tag == 'Host' and elem.text:
                info['host'] = elem.text.strip()
            elif elem.tag == 'Port' and elem.text:
                info['port'] = int(elem.text.strip())
            elif elem.tag == 'Username' and elem.text:
                info['username'] = elem.text.strip()
            elif elem.tag == 'Password' and elem.text:
                info['password'] = elem.text.strip()
            elif elem.tag == 'Encrypted' and elem.text:
                info['encrypted'] = elem.text.strip().lower() == 'true'
            elif elem.tag == 'AuthRequired' and elem.text:
                info['auth_required'] = elem.text.strip().lower() == 'true'
            elif elem.tag == 'MaxDownloadThreads' and elem.text:
                info['max_threads'] = int(elem.text.strip())
        
        import sys
        print(">>> Checking for BulkFolderMode/BulkFolderPath in XML...")
        sys.stdout.flush()
        
        # Check for BulkFolderMode first
        packages = root.find('.//Packages')
        if packages is not None:
            for package in packages.findall('.//SFDLPackage'):
                bulk_mode_elem = package.find('BulkFolderMode')
                if bulk_mode_elem is not None and bulk_mode_elem.text:
                    info['bulk_mode'] = bulk_mode_elem.text.strip().lower() == 'true'
                    print(f">>> Found BulkFolderMode: {info['bulk_mode']}")
                    sys.stdout.flush()
                
                # If bulk mode, extract BulkFolderPath
                if info['bulk_mode']:
                    bulk_list = package.find('BulkFolderList')
                    if bulk_list is not None:
                        for bulk_folder in bulk_list.findall('BulkFolder'):
                            bulk_path_elem = bulk_folder.find('BulkFolderPath')
                            if bulk_path_elem is not None and bulk_path_elem.text:
                                bulk_path = bulk_path_elem.text.strip()
                                info['bulk_paths'].append(bulk_path)
                                print(f">>> Found BulkFolderPath (encrypted): {bulk_path[:50]}...")
                                sys.stdout.flush()
        
        # Only extract individual files if not in bulk mode
        if not info['bulk_mode'] and packages is not None:
            for package in packages.findall('Package'):
                for file_elem in package.findall('File'):
                    file_info = {
                        'name': '',
                        'size': 0,
                        'path': ''
                    }
                    
                    for child in file_elem:
                        if child.tag == 'FileName' and child.text:
                            file_info['name'] = child.text.strip()
                        elif child.tag == 'FileSize' and child.text:
                            file_info['size'] = int(child.text.strip())
                        elif child.tag == 'FileFullPath' and child.text:
                            file_info['path'] = child.text.strip()
                    
                    if file_info['name']:
                        info['files'].append(file_info)
        
        # Use filename if no description
        if not info['name']:
            info['name'] = os.path.splitext(os.path.basename(sfdl_path))[0]
        
        # Decrypt if encrypted (same as regex parser)
        if info['encrypted']:
            print(">>> SFDL is encrypted (XML mode), attempting to decrypt...")
            sys.stdout.flush()
            
            encrypted_host = info['host']
            print(f">>> Testing with encrypted host: {encrypted_host[:30]}...")
            sys.stdout.flush()
            
            working_password = self.bruteforce_decrypt(encrypted_host)
            
            if not working_password:
                print(f">>> ✗ Could not find password!")
                sys.stdout.flush()
            else:
                print(f">>> ✓ Found password: {working_password}")
                sys.stdout.flush()
                
                # Decrypt metadata
                print(f">>> Decrypting metadata...")
                sys.stdout.flush()
                
                if info['host']:
                    decrypted = self.aes128cbc_decrypt(working_password, info['host'])
                    if decrypted:
                        info['host'] = decrypted
                        print(f">>> Decrypted host: {info['host']}")
                    sys.stdout.flush()
                    
                if info['username'] and info['username'] != 'anonymous':
                    decrypted = self.aes128cbc_decrypt(working_password, info['username'])
                    if decrypted:
                        info['username'] = decrypted
                        print(f">>> Decrypted username: {info['username']}")
                    sys.stdout.flush()
                    
                if info['password'] and info['password'] != 'anonymous@anonymous.nix':
                    decrypted = self.aes128cbc_decrypt(working_password, info['password'])
                    if decrypted:
                        info['password'] = decrypted
                        print(f">>> Decrypted password: ***")
                    sys.stdout.flush()
                    
                if info['name']:
                    decrypted_name = self.aes128cbc_decrypt(working_password, info['name'])
                    if decrypted_name:
                        info['name'] = decrypted_name
                        print(f">>> Decrypted name: {info['name']}")
                    sys.stdout.flush()
                
                # Decrypt bulk paths
                if info['bulk_paths']:
                    print(f">>> Decrypting {len(info['bulk_paths'])} bulk path(s)...")
                    sys.stdout.flush()
                    decrypted_paths = []
                    for bulk_path_encrypted in info['bulk_paths']:
                        bulk_path = self.aes128cbc_decrypt(working_password, bulk_path_encrypted)
                        if bulk_path:
                            decrypted_paths.append(bulk_path)
                            print(f">>> Decrypted path: {bulk_path}")
                        else:
                            print(f">>> ✗ Failed to decrypt path")
                        sys.stdout.flush()
                    info['bulk_paths'] = decrypted_paths
        
        return info
    
    def _parse_sfdl_regex(self, sfdl_path):
        """Parse SFDL using regex (fallback method like bash script)"""
        
        info = {
            'name': '',
            'uploader': '',
            'host': '',
            'port': 21,
            'username': 'anonymous',
            'password': 'anonymous@anonymous.nix',
            'encrypted': False,
            'auth_required': False,
            'max_threads': 3,
            'files': [],
            'bulk_mode': False,
            'bulk_paths': [],
            'bulk_mode': False,
            'bulk_paths': []
        }
        
        try:
            with open(sfdl_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Extract metadata using regex (like bash script with grep/cut)
            def extract_tag(tag_name):
                # Try multiple patterns to be more flexible
                patterns = [
                    f'<{tag_name}[^>]*>([^<]+)</{tag_name}>',  # Standard XML
                    f'<{tag_name}>([^<]+)</{tag_name}>',       # Simple tags
                    f'<{tag_name}[^>]*>\\s*([^<\\s][^<]*?)\\s*</{tag_name}>'  # With whitespace
                ]
                for pattern in patterns:
                    match = re.search(pattern, content, re.IGNORECASE | re.DOTALL)
                    if match:
                        return match.group(1).strip()
                return ''
            
            info['name'] = extract_tag('Description') or os.path.splitext(os.path.basename(sfdl_path))[0]
            # Remove zero-width space and other invisible characters
            info['name'] = re.sub(r'[\u200b-\u200f\ufeff]', '', info['name'])
            
            info['uploader'] = extract_tag('Uploader')
            info['host'] = extract_tag('Host')
            
            port_str = extract_tag('Port')
            if port_str and port_str.isdigit():
                info['port'] = int(port_str)
            
            username = extract_tag('Username')
            password = extract_tag('Password')
            
            auth_required = extract_tag('AuthRequired')
            info['auth_required'] = auth_required.lower() == 'true' if auth_required else False
            
            if not info['auth_required']:
                info['username'] = 'anonymous'
                info['password'] = 'anonymous@anonymous.nix'
            else:
                info['username'] = username or 'anonymous'
                info['password'] = password or 'anonymous@anonymous.nix'
            
            encrypted = extract_tag('Encrypted')
            info['encrypted'] = encrypted.lower() == 'true' if encrypted else False
            
            max_threads = extract_tag('MaxDownloadThreads')
            if max_threads and max_threads.isdigit():
                info['max_threads'] = int(max_threads)
            
            # Debug: Print what we found so far
            name_preview = info['name'][:50] + '...' if len(info['name']) > 50 else info['name']
            print(f"SFDL Info: name={name_preview}, host={info['host']}, port={info['port']}")
            print(f"Auth: user={info['username']}, auth_required={info['auth_required']}, encrypted={info['encrypted']}")
            
            import sys
            sys.stdout.flush()
            
            # Store original encrypted values
            encrypted_host = info['host'] if info['encrypted'] else None
            
            # Decrypt if encrypted
            working_password = None
            if info['encrypted']:
                print("SFDL is encrypted, attempting to decrypt...")
                
                # Find password once by testing encrypted host
                if encrypted_host:
                    print(f"  Testing encrypted host: {encrypted_host[:30]}...")
                    working_password = self.bruteforce_decrypt(encrypted_host)
                    if not working_password:
                        print("  ✗ Could not find valid password!")
                        return info
                    
                    # Now decrypt all fields with the found password
                    print(f"  ✓ Found password: {working_password}")
                    
                    # Decrypt host
                    if info['host']:
                        decrypted = self.aes128cbc_decrypt(working_password, info['host'])
                        if decrypted:
                            info['host'] = decrypted
                            print(f"  Decrypted host: {info['host']}")
                        else:
                            print(f"  ✗ Failed to decrypt host")
                    
                    # Decrypt username
                    if info['username'] and info['username'] != 'anonymous':
                        decrypted = self.aes128cbc_decrypt(working_password, info['username'])
                        if decrypted:
                            info['username'] = decrypted
                            print(f"  Decrypted username: {info['username']}")
                        else:
                            print(f"  ✗ Failed to decrypt username")
                    
                    # Decrypt password
                    if info['password'] and info['password'] != 'anonymous@anonymous.nix':
                        decrypted = self.aes128cbc_decrypt(working_password, info['password'])
                        if decrypted:
                            info['password'] = decrypted
                            print(f"  Decrypted password: {'*' * len(info['password'])}")
                        else:
                            print(f"  ✗ Failed to decrypt password")
                    
                    # Decrypt name/description
                    if info['name']:
                        decrypted = self.aes128cbc_decrypt(working_password, info['name'])
                        if decrypted:
                            info['name'] = decrypted
                            print(f"  Decrypted name: {info['name']}")
                        else:
                            print(f"  ✗ Failed to decrypt name")
            
            # Extract files - try multiple approaches
            if info['encrypted'] and working_password:
                print(f"Extracting files (encrypted with {working_password})...")
            
            # Debug: Show what tags exist in the SFDL
            print(f"\nDebug: Searching for file/package tags...")
            print(f"  Content length: {len(content)} bytes")
            if '<BulkFolderPath' in content:
                print(f"  Found BulkFolderPath tag in content")
            if '<Package' in content:
                print(f"  Found Package tag in content")
            if '<File' in content:
                print(f"  Found File tag in content")
            if '<BulkFolderMode>true</BulkFolderMode>' in content:
                print(f"  Found BulkFolderMode=true")
            
            # Check for BulkFolderPath first (like bashloader.sh does)
            # Pattern needs to handle nested structure
            bulk_pattern = r'<BulkFolderPath[^>]*>([^<]+)</BulkFolderPath>'
            bulk_matches = re.findall(bulk_pattern, content, re.IGNORECASE)
            
            print(f"  Regex found {len(bulk_matches)} BulkFolderPath matches")
            
            if bulk_matches:
                print(f"Found {len(bulk_matches)} BulkFolderPath(s) - using lftp to download directory")
                info['bulk_mode'] = True
                info['bulk_paths'] = []
                
                for idx, bulk_path_encrypted in enumerate(bulk_matches):
                    print(f"  Processing BulkFolderPath {idx+1}: {bulk_path_encrypted[:50]}...")
                    if info['encrypted'] and working_password:
                        bulk_path = self.aes128cbc_decrypt(working_password, bulk_path_encrypted)
                        if bulk_path:
                            info['bulk_paths'].append(bulk_path)
                            print(f"  ✓ Decrypted BulkFolderPath: {bulk_path}")
                        else:
                            print(f"  ✗ Failed to decrypt BulkFolderPath")
                    else:
                        info['bulk_paths'].append(bulk_path_encrypted)
                        print(f"  BulkFolderPath: {bulk_path_encrypted}")
                
                print(f"  Total decrypted paths: {len(info['bulk_paths'])}")
                # For bulk mode, we'll download with lftp and discover files during download
                return info
            
            # Method 1: Look for Package blocks first
            package_pattern = r'<Package[^>]*>(.*?)</Package>'
            package_matches = re.findall(package_pattern, content, re.DOTALL | re.IGNORECASE)
            
            if package_matches:
                print(f"Found {len(package_matches)} package(s)")
                for package_block in package_matches:
                    # Find files within package
                    file_pattern = r'<File[^>]*>(.*?)</File>'
                    file_matches = re.findall(file_pattern, package_block, re.DOTALL | re.IGNORECASE)
                    print(f"Found {len(file_matches)} file(s) in package")
                    
                    for file_block in file_matches:
                        file_info = self._extract_file_info(file_block)
                        if file_info and file_info['name']:
                            # Decrypt each file field individually if encrypted
                            if info['encrypted'] and working_password:
                                if file_info['name']:
                                    decrypted = self.aes128cbc_decrypt(working_password, file_info['name'])
                                    if decrypted:
                                        file_info['name'] = decrypted
                                
                                if file_info['path']:
                                    decrypted = self.aes128cbc_decrypt(working_password, file_info['path'])
                                    if decrypted:
                                        file_info['path'] = decrypted
                            
                            info['files'].append(file_info)
            else:
                # Method 2: Look for File blocks directly (no packages)
                print("No packages found, looking for direct File tags")
                file_pattern = r'<File[^>]*>(.*?)</File>'
                file_matches = re.findall(file_pattern, content, re.DOTALL | re.IGNORECASE)
                print(f"Found {len(file_matches)} file(s) directly")
                
                for file_block in file_matches:
                    file_info = self._extract_file_info(file_block)
                    if file_info and file_info['name']:
                        # Decrypt each file field individually if encrypted
                        if info['encrypted'] and working_password:
                            if file_info['name']:
                                decrypted = self.aes128cbc_decrypt(working_password, file_info['name'])
                                if decrypted:
                                    file_info['name'] = decrypted
                            
                            if file_info['path']:
                                decrypted = self.aes128cbc_decrypt(working_password, file_info['path'])
                                if decrypted:
                                    file_info['path'] = decrypted
                        
                        info['files'].append(file_info)
            
            print(f"Successfully parsed {len(info['files'])} files from SFDL using regex method")
            
            # Debug: Print first few files
            for i, f in enumerate(info['files'][:3]):
                print(f"  File {i+1}: {f['name']} ({f['size']} bytes) at {f['path']}")
            
            return info
            
        except Exception as e:
            print(f"Error in regex parsing: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _extract_file_info(self, file_block):
        """Extract file information from a File XML block"""
        
        file_info = {
            'name': '',
            'size': 0,
            'path': ''
        }
        
        # Extract filename - try multiple patterns
        name_patterns = [
            r'<FileName[^>]*>([^<]+)</FileName>',
            r'<FileName>([^<]+)</FileName>',
        ]
        for pattern in name_patterns:
            name_match = re.search(pattern, file_block, re.IGNORECASE)
            if name_match:
                file_info['name'] = name_match.group(1).strip()
                break
        
        # Extract file size
        size_patterns = [
            r'<FileSize[^>]*>([^<]+)</FileSize>',
            r'<FileSize>([^<]+)</FileSize>',
        ]
        for pattern in size_patterns:
            size_match = re.search(pattern, file_block, re.IGNORECASE)
            if size_match:
                try:
                    file_info['size'] = int(size_match.group(1).strip())
                except (ValueError, AttributeError):
                    file_info['size'] = 0
                break
        
        # Extract file path
        path_patterns = [
            r'<FileFullPath[^>]*>([^<]+)</FileFullPath>',
            r'<FileFullPath>([^<]+)</FileFullPath>',
        ]
        for pattern in path_patterns:
            path_match = re.search(pattern, file_block, re.IGNORECASE)
            if path_match:
                file_info['path'] = path_match.group(1).strip()
                break
        
        return file_info
    
    def update_status(self, status='running', action='', sfdl_name='', media_type='unknown', media_info=None):
        """Update status.json file"""
        try:
            status_data = {
                'data': [{
                    'version': '1.0',
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'datetime': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'status': status,
                    'sfdl': sfdl_name,
                    'action': action,
                    'media_type': media_type,
                    'loading_mt_files': len(self.current_files),
                    'loading_total_files': self.total_files,
                    'loading': '',
                    'loading_file_array': ''
                }]
            }
            
            # Add extra media metadata if available
            if media_info and isinstance(media_info, dict):
                if media_type == 'tv':
                    if 'seasons' in media_info:
                        status_data['data'][0]['media_seasons'] = media_info['seasons']
                    if 'episodes' in media_info:
                        status_data['data'][0]['media_episodes'] = media_info['episodes']
                elif media_type == 'movie':
                    if 'year' in media_info:
                        status_data['data'][0]['media_year'] = media_info['year']
            
            if self.is_downloading and self.start_time:
                elapsed = time.time() - self.start_time
                progress = (self.downloaded_bytes / self.total_bytes * 100) if self.total_bytes > 0 else 0
                speed = (self.downloaded_bytes / 1024 / elapsed) if elapsed > 0 else 0  # KB/s
                
                # Format: status|downloaded_kb|total_kb|percent|speed_mb|time
                hours = int(elapsed // 3600)
                minutes = int((elapsed % 3600) // 60)
                seconds = int(elapsed % 60)
                time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                
                status_data['data'][0]['loading'] = f"{status}|{self.downloaded_bytes//1024}|{self.total_bytes//1024}|{progress:.1f}|{speed/1024:.2f}|{time_str}"
                
                # Format file array
                file_array_parts = []
                for file_info in self.current_files:
                    fname = file_info.get('name', 'unknown')
                    fsize = file_info.get('size', 0)
                    fdownloaded = file_info.get('downloaded', 0)
                    file_array_parts.append(f"{fname}|{fsize}|{fdownloaded}")
                
                status_data['data'][0]['loading_file_array'] = ';'.join(file_array_parts)
            
            # Write to status file
            os.makedirs(os.path.dirname(self.status_file), exist_ok=True)
            with open(self.status_file, 'w') as f:
                json.dump(status_data, f, indent=2)
                
        except Exception as e:
            print(f"Error updating status: {e}")
    
    def download_file_ftp(self, host, port, username, password, remote_path, local_path, file_info):
        """Download a single file via FTP"""
        try:
            # Create directory if needed
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            
            # Connect to FTP
            ftp = ftplib.FTP()
            ftp.connect(host, port, timeout=30)
            ftp.login(username, password)
            ftp.set_pasv(True)
            
            # Change to directory
            if remote_path:
                try:
                    ftp.cwd(remote_path)
                except:
                    pass
            
            # Download file with progress tracking
            file_info['downloaded'] = 0
            
            def handle_binary(data):
                f.write(data)
                file_info['downloaded'] += len(data)
                self.downloaded_bytes += len(data)
            
            with open(local_path, 'wb') as f:
                ftp.retrbinary(f"RETR {file_info['name']}", handle_binary)
            
            ftp.quit()
            return True
            
        except Exception as e:
            print(f"Error downloading {file_info['name']}: {e}")
            return False
    
    def download_bulk_lftp(self, sfdl_info, sfdl_path):
        """Download entire directory using lftp (for BulkFolderPath mode)"""
        import subprocess
        import sys
        
        try:
            download_dir = os.path.join(self.config['downloads'], sfdl_info['name'])
            os.makedirs(download_dir, exist_ok=True)
            
            print(f"\nDownloading to: {download_dir}")
            print(f"Using lftp for bulk download...")
            sys.stdout.flush()
            
            # Set large placeholder values for bulk downloads
            self.total_bytes = 10 * 1024 * 1024 * 1024  # 10 GB placeholder
            self.total_files = 1  # At least 1 file
            self.downloaded_bytes = 0
            self.downloaded_files = 0
            
            # Update status to downloading
            self.update_status(
                status='running',
                action='loading',
                sfdl_name=sfdl_info['name']
            )
            
            for bulk_path in sfdl_info['bulk_paths']:
                print(f"\nDownloading directory: {bulk_path}")
                sys.stdout.flush()
                
                # Step 1: First get index with file sizes (like bashloader.sh)
                print(f"Loading index with lftp...")
                sys.stdout.flush()
                
                index_cmd = [
                    'lftp',
                    '-p', str(sfdl_info['port']),
                    '-u', f"{sfdl_info['username']},{sfdl_info['password']}",
                    '-e',
                    f"set ftp:use-feat no; set ssl:verify-certificate no; set net:timeout 30; set net:reconnect-interval-base 5; set net:max-retries 2; set ftp:ssl-allow no; open && find -l '{bulk_path}' && exit",
                    sfdl_info['host']
                ]
                
                try:
                    index_result = subprocess.run(index_cmd, capture_output=True, text=True, timeout=60)
                    if index_result.returncode == 0 and index_result.stdout:
                        # Parse index to get file sizes
                        total_size = 0
                        file_count = 0
                        expected_files = {}  # filename -> expected size
                        
                        for line in index_result.stdout.splitlines():
                            # Skip directories (lines starting with 'd')
                            if line.startswith('d'):
                                continue
                            # Extract file size and name
                            parts = line.split()
                            if len(parts) >= 3:
                                try:
                                    size = int(parts[2])
                                    if size > 0:
                                        # Get filename (last part of line)
                                        filename = parts[-1].split('/')[-1]
                                        expected_files[filename] = size
                                        total_size += size
                                        file_count += 1
                                except ValueError:
                                    pass
                        
                        # Set real totals
                        self.total_bytes = total_size
                        self.total_files = file_count
                        print(f"  Found {file_count} file(s), total size: {total_size / 1024 / 1024:.2f} MB")
                        sys.stdout.flush()
                    else:
                        expected_files = {}
                        print(f"  Warning: Could not load index, using placeholder values")
                        sys.stdout.flush()
                except subprocess.TimeoutExpired:
                    expected_files = {}
                    print(f"  Warning: Index loading timed out, using placeholder values")
                    sys.stdout.flush()
                except Exception as e:
                    expected_files = {}
                    print(f"  Warning: Error loading index: {e}")
                    sys.stdout.flush()
                
                # Step 2: Now download with mirror
                lftp_cmd = [
                    'lftp',
                    '-p', str(sfdl_info['port']),
                    '-u', f"{sfdl_info['username']},{sfdl_info['password']}",
                    '-e',
                    f"set ftp:use-feat no; set ssl:verify-certificate no; set net:timeout 30; set net:reconnect-interval-base 5; set net:max-retries 2; set ftp:ssl-allow no; mirror --verbose --parallel=3 --exclude-glob '*.nfo' --exclude-glob '*-sample*' --exclude-glob '*.jpg' --exclude-glob '*.sub' --exclude-glob '*.idx' '{bulk_path}' '{download_dir}'; exit",
                    sfdl_info['host']
                ]
                
                print(f"Running: lftp -p {sfdl_info['port']} -u {sfdl_info['username']},*** {sfdl_info['host']}")
                print(f"  mirror '{bulk_path}' -> '{download_dir}'")
                sys.stdout.flush()
                
                # Run lftp in background and monitor progress
                import threading
                
                process = subprocess.Popen(lftp_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                
                # Monitor download progress in separate thread
                def monitor_progress():
                    while process.poll() is None:
                        try:
                            # Calculate downloaded size and count files
                            total_size = 0
                            file_list = []
                            
                            for root, dirs, files in os.walk(download_dir):
                                for file in files:
                                    file_path = os.path.join(root, file)
                                    if os.path.exists(file_path):
                                        file_size = os.path.getsize(file_path)
                                        total_size += file_size
                                        file_list.append({
                                            'name': file,
                                            'path': file_path,
                                            'size': file_size
                                        })
                            
                            # Update downloaded bytes
                            self.downloaded_bytes = total_size
                            
                            # Build current files list with expected sizes
                            self.current_files = []
                            for file_info in file_list:
                                # Get expected size from index
                                expected_size = expected_files.get(file_info['name'], file_info['size'])
                                
                                self.current_files.append({
                                    'name': file_info['name'],
                                    'size': expected_size,  # Expected size from index
                                    'downloaded': file_info['size']  # Current downloaded size
                                })
                            
                            # Update status with current size
                            self.update_status(
                                status='running',
                                action='loading',
                                sfdl_name=sfdl_info['name']
                            )
                            
                            time.sleep(2)  # Update every 2 seconds
                        except Exception as e:
                            pass
                
                monitor_thread = threading.Thread(target=monitor_progress, daemon=True)
                monitor_thread.start()
                
                # Wait for lftp to finish and show output
                for line in process.stdout:
                    print(line, end='')
                    sys.stdout.flush()
                
                returncode = process.wait()
                monitor_thread.join(timeout=1)
                
                if returncode == 0:
                    print(f"\n  ✓ Successfully downloaded {bulk_path}")
                else:
                    print(f"\n  ✗ Error downloading {bulk_path} (exit code: {returncode})")
                
                sys.stdout.flush()
            
            # Final update: Set downloaded to total (100%)
            self.downloaded_bytes = self.total_bytes
            
            # Detect media type using TMDB
            print(f"\n  Detecting media type...")
            media_info = self.detect_media_type(sfdl_info['name'])
            if isinstance(media_info, dict):
                media_type = media_info.get('type', 'unknown')
            else:
                media_type = media_info
                media_info = {'type': media_type}
            
            self.update_status(
                status='running',
                action='loading',
                sfdl_name=sfdl_info['name'],
                media_type=media_type,
                media_info=media_info
            )
            time.sleep(1)  # Give frontend time to show 100%
            
            # Cleanup unwanted files first
            print(f"\n  Cleaning up unwanted files...")
            self.cleanup_unwanted_files(download_dir, sfdl_name=sfdl_info['name'])
            
            # Extract archives if enabled
            print(f"\n  Checking for archives to extract...")
            self.extract_archives(download_dir, sfdl_name=sfdl_info['name'])
            
            # Move to appropriate folder based on media type
            if media_type == 'movie':
                # For movies: Find .mkv file and move it directly to /movies with proper name
                final_dir = os.path.join(self.config['downloads'], 'movies')
                os.makedirs(final_dir, exist_ok=True)
                import shutil
                
                # Find .mkv file recursively
                mkv_file = None
                for root, dirs, files in os.walk(download_dir):
                    for filename in files:
                        if filename.lower().endswith('.mkv'):
                            mkv_file = os.path.join(root, filename)
                            break
                    if mkv_file:
                        break
                
                if mkv_file:
                    # Use SFDL name or folder name for the movie file
                    folder_name = os.path.basename(download_dir)
                    movie_filename = folder_name + '.mkv'
                    destination = os.path.join(final_dir, movie_filename)
                    
                    print(f"\n  Moving movie to: {final_dir}")
                    # Remove destination if exists
                    if os.path.exists(destination):
                        os.remove(destination)
                    
                    shutil.move(mkv_file, destination)
                    print(f"  ✓ Moved movie to: {destination}")
                    
                    # Remove download directory after moving the movie
                    try:
                        shutil.rmtree(download_dir)
                        print(f"  ✓ Cleaned up download directory")
                    except Exception as e:
                        print(f"  ⚠ Failed to remove download directory: {e}")
                else:
                    print(f"  ⚠ No .mkv file found in {download_dir}")
                    
            elif media_type == 'tv':
                # For TV series: Organize by series name and season folders
                final_dir = os.path.join(self.config['downloads'], 'serien')
                os.makedirs(final_dir, exist_ok=True)
                import shutil
                import re
                
                # Get series name from TMDB
                series_name = media_info.get('name', 'Unknown Series')
                series_folder = os.path.join(final_dir, series_name)
                os.makedirs(series_folder, exist_ok=True)
                
                print(f"\n  Organizing series: {series_name}")
                
                # Find all .mkv files and organize by season
                season_files = {}
                for root, dirs, files in os.walk(download_dir):
                    for filename in files:
                        if filename.lower().endswith('.mkv'):
                            # Extract season number from filename (S01, S02, etc.)
                            season_match = re.search(r'[Ss](\d{2})', filename)
                            if season_match:
                                season_num = int(season_match.group(1))
                                season_key = f"Season {season_num:02d}"
                                
                                if season_key not in season_files:
                                    season_files[season_key] = []
                                
                                season_files[season_key].append({
                                    'source': os.path.join(root, filename),
                                    'filename': filename
                                })
                
                # Move files to season folders
                for season_folder_name, files in season_files.items():
                    season_path = os.path.join(series_folder, season_folder_name)
                    os.makedirs(season_path, exist_ok=True)
                    
                    for file_info in files:
                        destination = os.path.join(season_path, file_info['filename'])
                        
                        # Remove destination if exists
                        if os.path.exists(destination):
                            os.remove(destination)
                        
                        shutil.move(file_info['source'], destination)
                        print(f"  ✓ Moved to {season_folder_name}: {file_info['filename']}")
                
                # Clean up download directory
                try:
                    shutil.rmtree(download_dir)
                    print(f"  ✓ Cleaned up download directory")
                except Exception as e:
                    print(f"  ⚠ Failed to remove download directory: {e}")
                    
            else:
                # Unknown type: keep in downloads folder
                final_dir = self.config['downloads']
            
            # Save metadata to .metadata.json
            try:
                metadata_file = os.path.join(self.config['files'], '.metadata.json')
                metadata = {}
                if os.path.exists(metadata_file):
                    with open(metadata_file, 'r') as mf:
                        metadata = json.load(mf)
                
                sfdl_filename = os.path.basename(sfdl_path)
                metadata[sfdl_filename] = media_info
                
                with open(metadata_file, 'w') as mf:
                    json.dump(metadata, mf, indent=2)
                
                print(f"  ✓ Metadata saved: {media_type}")
            except Exception as e:
                print(f"  ⚠ Failed to save metadata: {e}")
            
            # Move SFDL to done folder
            done_dir = os.path.join(self.config['files'], 'done')
            os.makedirs(done_dir, exist_ok=True)
            import shutil
            shutil.move(sfdl_path, os.path.join(done_dir, os.path.basename(sfdl_path)))
            
            # Mark as complete
            self.is_downloading = False
            self.update_status(status='done', action='done', sfdl_name='')
            return True
            
        except Exception as e:
            print(f"Error in bulk download: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def download_sfdl(self, sfdl_path):
        """Download all files from SFDL"""
        try:
            import sys
            print(f"\n>>> download_sfdl called for: {sfdl_path}")
            sys.stdout.flush()
            
            self.is_downloading = True
            self.start_time = time.time()
            
            # Parse SFDL
            print(f">>> Parsing SFDL...")
            sys.stdout.flush()
            sfdl_info = self.parse_sfdl(sfdl_path)
            
            if not sfdl_info:
                print(f">>> Parse failed, sfdl_info is None")
                sys.stdout.flush()
                return False
            
            print(f">>> Parse succeeded!")
            print(f">>> bulk_mode: {sfdl_info.get('bulk_mode')}")
            print(f">>> bulk_paths: {sfdl_info.get('bulk_paths')}")
            print(f">>> files count: {len(sfdl_info.get('files', []))}")
            sys.stdout.flush()
            
            # Check if bulk mode (use lftp)
            if sfdl_info.get('bulk_mode') and sfdl_info.get('bulk_paths'):
                print(f">>> Entering bulk mode download...")
                sys.stdout.flush()
                return self.download_bulk_lftp(sfdl_info, sfdl_path)
            
            self.total_files = len(sfdl_info['files'])
            self.downloaded_files = 0
            self.total_bytes = sum(f['size'] for f in sfdl_info['files'])
            self.downloaded_bytes = 0
            
            # Filter out unwanted files before download
            filtered_files = []
            for f in sfdl_info['files']:
                filename = f['name'].lower()
                # Skip .nfo, .jpg, .sub, .idx files and files with -sample in name
                if filename.endswith('.nfo') or filename.endswith('.jpg') or filename.endswith('.sub') or filename.endswith('.idx') or '-sample' in filename:
                    print(f"  Skipping unwanted file: {f['name']}")
                    self.total_files -= 1
                    self.total_bytes -= f['size']
                else:
                    filtered_files.append(f)
            
            sfdl_info['files'] = filtered_files
            
            # Create download directory
            download_dir = os.path.join(self.config['downloads'], sfdl_info['name'])
            os.makedirs(download_dir, exist_ok=True)
            
            # Download files with threading
            max_threads = min(sfdl_info['max_threads'], self.config['max_threads'])
            threads = []
            file_queue = list(sfdl_info['files'])
            
            def worker():
                while file_queue and self.is_downloading:
                    try:
                        file_info = file_queue.pop(0)
                    except IndexError:
                        break
                    
                    # Add to current files
                    self.current_files.append(file_info)
                    
                    # Update status
                    self.update_status(
                        status='running',
                        action='loading',
                        sfdl_name=sfdl_info['name']
                    )
                    
                    # Download file
                    local_path = os.path.join(download_dir, file_info['name'])
                    success = self.download_file_ftp(
                        sfdl_info['host'],
                        sfdl_info['port'],
                        sfdl_info['username'],
                        sfdl_info['password'],
                        file_info['path'],
                        local_path,
                        file_info
                    )
                    
                    if success:
                        self.downloaded_files += 1
                    
                    # Remove from current files
                    self.current_files.remove(file_info)
            
            # Start worker threads
            for i in range(max_threads):
                t = threading.Thread(target=worker)
                t.start()
                threads.append(t)
            
            # Wait for all threads with periodic status updates
            while any(t.is_alive() for t in threads):
                self.update_status(
                    status='running',
                    action='loading',
                    sfdl_name=sfdl_info['name']
                )
                time.sleep(0.5)
            
            # Detect media type using TMDB
            print(f"\n  Detecting media type...")
            media_info = self.detect_media_type(sfdl_info['name'])
            if isinstance(media_info, dict):
                media_type = media_info.get('type', 'unknown')
            else:
                media_type = media_info
                media_info = {'type': media_type}
            
            # Cleanup unwanted files first
            print(f"\n  Cleaning up unwanted files...")
            self.cleanup_unwanted_files(download_dir, sfdl_name=sfdl_info['name'])
            
            # Extract archives if enabled
            print(f"\n  Checking for archives to extract...")
            self.extract_archives(download_dir, sfdl_name=sfdl_info['name'])
            
            # Move to appropriate folder based on media type
            if media_type == 'movie':
                # For movies: Find .mkv file and move it directly to /movies with proper name
                final_dir = os.path.join(self.config['downloads'], 'movies')
                os.makedirs(final_dir, exist_ok=True)
                import shutil
                
                # Find .mkv file recursively
                mkv_file = None
                for root, dirs, files in os.walk(download_dir):
                    for filename in files:
                        if filename.lower().endswith('.mkv'):
                            mkv_file = os.path.join(root, filename)
                            break
                    if mkv_file:
                        break
                
                if mkv_file:
                    # Use SFDL name or folder name for the movie file
                    folder_name = os.path.basename(download_dir)
                    movie_filename = folder_name + '.mkv'
                    destination = os.path.join(final_dir, movie_filename)
                    
                    print(f"\n  Moving movie to: {final_dir}")
                    # Remove destination if exists
                    if os.path.exists(destination):
                        os.remove(destination)
                    
                    shutil.move(mkv_file, destination)
                    print(f"  ✓ Moved movie to: {destination}")
                    
                    # Remove download directory after moving the movie
                    try:
                        shutil.rmtree(download_dir)
                        print(f"  ✓ Cleaned up download directory")
                    except Exception as e:
                        print(f"  ⚠ Failed to remove download directory: {e}")
                else:
                    print(f"  ⚠ No .mkv file found in {download_dir}")
                    
            elif media_type == 'tv':
                # For TV series: Organize by series name and season folders
                final_dir = os.path.join(self.config['downloads'], 'serien')
                os.makedirs(final_dir, exist_ok=True)
                import shutil
                import re
                
                # Get series name from TMDB
                series_name = media_info.get('name', 'Unknown Series')
                series_folder = os.path.join(final_dir, series_name)
                os.makedirs(series_folder, exist_ok=True)
                
                print(f"\n  Organizing series: {series_name}")
                
                # Find all .mkv files and organize by season
                season_files = {}
                for root, dirs, files in os.walk(download_dir):
                    for filename in files:
                        if filename.lower().endswith('.mkv'):
                            # Extract season number from filename (S01, S02, etc.)
                            season_match = re.search(r'[Ss](\d{2})', filename)
                            if season_match:
                                season_num = int(season_match.group(1))
                                season_key = f"Season {season_num:02d}"
                                
                                if season_key not in season_files:
                                    season_files[season_key] = []
                                
                                season_files[season_key].append({
                                    'source': os.path.join(root, filename),
                                    'filename': filename
                                })
                
                # Move files to season folders
                for season_folder_name, files in season_files.items():
                    season_path = os.path.join(series_folder, season_folder_name)
                    os.makedirs(season_path, exist_ok=True)
                    
                    for file_info in files:
                        destination = os.path.join(season_path, file_info['filename'])
                        
                        # Remove destination if exists
                        if os.path.exists(destination):
                            os.remove(destination)
                        
                        shutil.move(file_info['source'], destination)
                        print(f"  ✓ Moved to {season_folder_name}: {file_info['filename']}")
                
                # Clean up download directory
                try:
                    shutil.rmtree(download_dir)
                    print(f"  ✓ Cleaned up download directory")
                except Exception as e:
                    print(f"  ⚠ Failed to remove download directory: {e}")
                    
            else:
                # Unknown type: keep in downloads folder
                final_dir = self.config['downloads']
            
            # Save metadata to .metadata.json
            try:
                metadata_file = os.path.join(self.config['files'], '.metadata.json')
                metadata = {}
                if os.path.exists(metadata_file):
                    with open(metadata_file, 'r') as mf:
                        metadata = json.load(mf)
                
                sfdl_filename = os.path.basename(sfdl_path)
                metadata[sfdl_filename] = media_info
                
                with open(metadata_file, 'w') as mf:
                    json.dump(metadata, mf, indent=2)
                
                print(f"  ✓ Metadata saved: {media_type}")
            except Exception as e:
                print(f"  ⚠ Failed to save metadata: {e}")
            
            # Mark as done
            self.is_downloading = False
            self.update_status(status='done', action='done', sfdl_name='', media_type=media_type, media_info=media_info)
            
            # Move SFDL file to done folder
            done_dir = os.path.join(self.config['files'], 'done')
            os.makedirs(done_dir, exist_ok=True)
            done_path = os.path.join(done_dir, os.path.basename(sfdl_path))
            os.rename(sfdl_path, done_path)
            
            return True
            
        except Exception as e:
            print(f"Error downloading SFDL: {e}")
            self.is_downloading = False
            self.update_status(status='error', action=f'Error: {str(e)}')
            return False
    
    def process_sfdl_files(self):
        """Process all SFDL files in the queue"""
        import sys
        
        # Ensure output is flushed immediately
        sys.stdout.flush()
        sys.stderr.flush()
        
        sfdl_dir = self.config['files']
        
        if not os.path.exists(sfdl_dir):
            print(f"SFDL directory not found: {sfdl_dir}")
            sys.stdout.flush()
            return
        
        # Find all .sfdl files
        sfdl_files = [f for f in os.listdir(sfdl_dir) if f.endswith('.sfdl')]
        
        print(f"Found {len(sfdl_files)} SFDL file(s) in {sfdl_dir}")
        sys.stdout.flush()
        
        if not sfdl_files:
            self.update_status(status='done', action='done', sfdl_name='')
            return
        
        # Process each file
        for sfdl_file in sfdl_files:
            sfdl_path = os.path.join(sfdl_dir, sfdl_file)
            print(f"\n{'='*60}")
            print(f"Processing: {sfdl_file}")
            print(f"{'='*60}")
            sys.stdout.flush()
            
            try:
                result = self.download_sfdl(sfdl_path)
                print(f"\nDownload result: {result}")
                sys.stdout.flush()
            except Exception as e:
                print(f"\n✗ Error processing {sfdl_file}: {e}")
                import traceback
                traceback.print_exc()
                sys.stdout.flush()
    
    def start_async(self):
        """Start downloading in background thread"""
        if self.download_thread and self.download_thread.is_alive():
            return False
        
        self.download_thread = threading.Thread(target=self.process_sfdl_files)
        self.download_thread.daemon = True
        self.download_thread.start()
        return True


if __name__ == "__main__":
    # Direct execution for testing
    import sys
    
    # Enable line buffering for immediate output
    sys.stdout = os.fdopen(sys.stdout.fileno(), 'w', buffering=1)
    
    # Setup paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(script_dir, 'loader.cfg')
    status_file = os.path.join(script_dir, 'status', 'status.json')
    
    downloader = Downloader(config_path, status_file)
    print(f"Checking for SFDL files in: {downloader.config['files']}")
    sys.stdout.flush()
    
    downloader.process_sfdl_files()
    
    print("\nDone!")
    sys.stdout.flush()
