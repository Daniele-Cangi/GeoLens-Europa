import requests
import json
import time

url = "http://localhost:3003/api/cell/871ef4643ffffff"

print(f"Requesting {url}...")
start = time.time()
try:
    response = requests.get(url, timeout=300) # 5 minutes
    print(f"Status: {response.status_code}")
    print(f"Time: {time.time() - start:.2f}s")
    if response.status_code == 200:
        data = response.json()
        print(json.dumps(data, indent=2))
        
        # Check rain
        rain = data.get('water', {}).get('rain24h', 0)
        print(f"Rain 24h: {rain}")
        if rain > 0:
            print("SUCCESS: Rain data returned!")
        else:
            print("FAILURE: Rain data is 0.")
    else:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Exception: {e}")
