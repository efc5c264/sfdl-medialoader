#!/usr/bin/env python3
"""
Password Hashing Utility
"""

import hashlib
import sys
import getpass

def hash_password(password):
    """Generate SHA256 hash of password"""
    return hashlib.sha256(password.encode()).hexdigest()

def main():
    print("=" * 60)
    print("Passwort Hash Generator")
    print("=" * 60)
    print()
    
    if len(sys.argv) > 1:
        # Password provided as argument
        password = sys.argv[1]
    else:
        # Interactive mode
        password = getpass.getpass("Passwort eingeben: ")
        password_confirm = getpass.getpass("Passwort bestätigen: ")
        
        if password != password_confirm:
            print("Fehler: Passwörter stimmen nicht überein!")
            sys.exit(1)
    
    if not password:
        print("Fehler: Passwort darf nicht leer sein!")
        sys.exit(1)
    
    password_hash = hash_password(password)
    
    print()
    print("Passwort Hash:")
    print("-" * 60)
    print(password_hash)
    print("-" * 60)
    print()
    print("Hinweis: Diesen Hash können Sie in der .env verwenden")
    print("oder das Klartext-Passwort beibehalten (wird automatisch gehasht)")

if __name__ == "__main__":
    main()
