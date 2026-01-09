"""
Quick Python test to verify SSO certs work with httpx/requests
Run this AFTER running the bun test (it creates the cert files)

Usage: python test_sso_python.py
"""

import httpx
import os

# Config - same as TypeScript test
SAP_URL = "https://cpdb1pas.corp.medtronic.com:8007"
SAP_CLIENT = "100"
CSRF_URL = f"{SAP_URL}/sap/bc/adt/compatibility/graph?sap-client={SAP_CLIENT}"

# Cert files saved by the bun test
TEMP_DIR = os.environ.get('TEMP', '/tmp')
CERT_PATH = os.path.join(TEMP_DIR, 'sso_test_cert.pem')
KEY_PATH = os.path.join(TEMP_DIR, 'sso_test_key.pem')

print("=" * 50)
print("Python SSO mTLS Test")
print("=" * 50)
print(f"SAP URL: {SAP_URL}")
print(f"Cert path: {CERT_PATH}")
print(f"Key path: {KEY_PATH}")
print()

# Check if cert files exist
if not os.path.exists(CERT_PATH):
    print(f"ERROR: Cert file not found at {CERT_PATH}")
    print("Run the bun test first to generate cert files")
    exit(1)

if not os.path.exists(KEY_PATH):
    print(f"ERROR: Key file not found at {KEY_PATH}")
    print("Run the bun test first to generate cert files")
    exit(1)

# Show cert file contents (first few lines)
with open(CERT_PATH, 'r') as f:
    cert_content = f.read()
    print(f"Cert file size: {len(cert_content)} chars")
    print(f"Cert starts with: {cert_content[:50]}...")
    print(f"Cert has {cert_content.count('BEGIN CERTIFICATE')} certificates")

print()
print("Testing with httpx...")
print("-" * 50)

try:
    # Create httpx client with client cert (like ADT client does)
    with httpx.Client(
        cert=(CERT_PATH, KEY_PATH),
        verify=False,  # Disable SSL verification
        timeout=30.0
    ) as client:
        response = client.get(
            CSRF_URL,
            headers={
                'x-csrf-token': 'fetch',
                'Accept': 'application/xml',
            }
        )

        print(f"Response status: {response.status_code}")
        csrf_token = response.headers.get('x-csrf-token')
        print(f"CSRF token: {csrf_token[:30] if csrf_token else 'NOT FOUND'}...")

        if response.status_code == 200 and csrf_token and csrf_token != 'fetch':
            print()
            print("SUCCESS! Python httpx works with the certs!")
            print("This means the certs are valid but Bun/Node isn't sending them correctly.")
        else:
            print()
            print(f"FAILED with status {response.status_code}")
            print(f"Response body (first 200 chars): {response.text[:200]}")

except Exception as e:
    print(f"ERROR: {e}")

print()
print("=" * 50)
