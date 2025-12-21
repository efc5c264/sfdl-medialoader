#!/usr/bin/env python3

from playwright.sync_api import sync_playwright
import re
import time
from urllib.parse import urljoin

class SFDLForumDownloader:
    def __init__(self, username, password, downloader=None, sfdl_name=None):
        self.username = username
        self.password = password
        self.base_url = 'https://mlcboard.com/forum/'
        self.logged_in = False
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.downloader = downloader
        self.sfdl_name = sfdl_name
    
    def __enter__(self):
        """Context manager entry"""
        self.start_browser()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.close_browser()
    
    def start_browser(self):
        """Start Playwright browser"""
        self.playwright = sync_playwright().start()
        # Use chromium in headless mode
        self.browser = self.playwright.chromium.launch(headless=True)
        self.context = self.browser.new_context()
        self.page = self.context.new_page()
        print("✓ Browser started")
    
    def close_browser(self):
        """Close browser"""
        if self.page:
            self.page.close()
        if self.context:
            self.context.close()
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
    
    def login(self, target_url=None):
        """Login to the forum using real browser"""
        try:
            if not self.page:
                self.start_browser()
            
            # Navigate to target URL first (will show login form if not logged in)
            if target_url:
                self.page.goto(target_url, wait_until='domcontentloaded', timeout=30000)
            else:
                # Go to login page directly
                login_url = urljoin(self.base_url, 'login.php?do=login')
                self.page.goto(login_url, wait_until='domcontentloaded', timeout=30000)
            
            # Wait for login form to appear - specifically the one in the login block, not navbar
            self.page.wait_for_selector('input#vb_login_username[type="text"]', state='visible', timeout=10000)
            
            # Fill login form - use the visible form in the login block
            self.page.fill('input#vb_login_username[type="text"]', self.username)
            self.page.fill('input#vb_login_password[type="password"]', self.password)
            
            # Click login button
            # Click the submit button with class="loginbutton" or value="Anmelden" (the visible one)
            self.page.click('input[type="submit"][value="Anmelden"]:visible, input.loginbutton:visible')
            try:
                self.page.wait_for_load_state('networkidle', timeout=10000)
            except:
                pass
            
            # Wait for JavaScript cookies to be set
            time.sleep(3)
            
            # If we logged in from a thread page, navigate back to it
            if target_url and 'showthread.php' in target_url:
                self.page.goto(target_url, wait_until='networkidle', timeout=30000)
            
            # Check if login was successful
            content = self.page.content()
            if 'login.php?do=logout' in content or self.username.lower() in content.lower():
                print(f"✓ Successfully logged in as {self.username}")
                self.logged_in = True
                return True
            else:
                print("✗ Login failed - could not verify login")
                return False
                
        except Exception as e:
            print(f"✗ Login error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def thank_post(self, thread_id):
        """Click 'Thanks' button on the FIRST post to reveal download links"""
        try:
            if not self.logged_in:
                print("✗ Not logged in")
                return False
            
            # Navigate to thread
            thread_url = urljoin(self.base_url, f'showthread.php?t={thread_id}')
            self.page.goto(thread_url, wait_until='networkidle', timeout=30000)
            
            # Find first thanks button and click it
            thanks_button = self.page.query_selector('a.ht_thanks_button')
            
            if thanks_button:
                thanks_button.click()
                
                # Wait for AJAX response
                time.sleep(2)
                print(f"✓ Clicked thanks button")
                return True
            else:
                print("⚠ Thanks button not found (may already be thanked)")
                return True  # Continue anyway, might already be thanked
                
        except Exception as e:
            print(f"✗ Error thanking post: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def extract_sfdl_link(self, thread_url_or_id):
        """Extract SFDL download link from forum thread"""
        try:
            # Convert to thread ID if full URL is provided
            if 'showthread.php' in thread_url_or_id:
                match = re.search(r't=(\d+)', thread_url_or_id)
                if match:
                    thread_id = match.group(1)
                else:
                    print(f"✗ Could not extract thread ID from URL")
                    return None
            else:
                thread_id = thread_url_or_id
            
            # Build thread URL
            thread_url = urljoin(self.base_url, f'showthread.php?t={thread_id}')
            
            # Login if not already logged in - navigate to thread first, then login there
            if not self.logged_in:
                if self.downloader and self.sfdl_name:
                    self.downloader.update_status(
                        status='running',
                        action='Forum-Login wird durchgeführt...',
                        sfdl_name=self.sfdl_name
                    )
                if not self.login(target_url=thread_url):
                    print("✗ Login failed - cannot access forum threads without login")
                    return None
                # After successful login, we're already on the thread page
            else:
                # Already logged in, just navigate to thread
                self.page.goto(thread_url, wait_until='networkidle', timeout=30000)
            
            # Thank the post to reveal links
            if self.downloader and self.sfdl_name:
                self.downloader.update_status(
                    status='running',
                    action='Danke-Button wird geklickt...',
                    sfdl_name=self.sfdl_name
                )
            self.thank_post(thread_id)
            
            # Reload page to get updated content with revealed links
            if self.downloader and self.sfdl_name:
                self.downloader.update_status(
                    status='running',
                    action='SFDL-Link wird extrahiert...',
                    sfdl_name=self.sfdl_name
                )
            self.page.goto(thread_url, wait_until='networkidle', timeout=30000)
            
            # Get page content
            html_content = self.page.content()
            
            # Extract SFDL link
            sfdl_pattern = r'https?://(?:download\.)?sfdl\.net/enc/[^"\s<>]+'
            matches = re.findall(sfdl_pattern, html_content)
            
            if matches:
                sfdl_url = matches[0]  # Take first match
                print(f"✓ Extracted SFDL URL: {sfdl_url}")
                return sfdl_url
            else:
                print("✗ No SFDL link found in thread")
                return None
                
        except Exception as e:
            print(f"✗ Error extracting SFDL link: {e}")
            import traceback
            traceback.print_exc()
            return None
