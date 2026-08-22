import logging
import sys
from datetime import datetime, timedelta
# Add current dir to path to find src
sys.path.append(".")

# Configure logging
logging.basicConfig(level=logging.INFO)

from src.imerg_client import authenticate, load_imerg_cube

def verify_fix():
    print("--- Verifying Fix in imerg_client.py ---")
    
    # 1. Authenticate
    try:
        authenticate()
    except Exception as e:
        print(f"❌ Auth failed: {e}")
        return

    # 2. Load data (Targeted area: Swiss Alps, 24h ago)
    # This matches the parameters that we know have rain
    lat_min, lat_max = 46.0, 49.0
    lon_min, lon_max = 7.0, 10.0
    
    # Test with 6h latency (matching main.py production setting)
    t_ref = datetime.utcnow() - timedelta(hours=6)
    print(f"Time: {t_ref}")
    
    try:
        # Load 1 hour of data
        # Note: We need to temporarily patch the LAT/LON constants in config if we want to target Alps
        # But load_imerg_cube reads from config.
        # Let's just run it with default config (Europe) and check max value.
        # If it finds rain anywhere in Europe, we are good.
        
        data, source = load_imerg_cube(t_ref, 24, use_early=True)
        
        print(f"\n✅ SUCCESS: Load function returned!")
        print(f"Source: {source}")
        print(f"Shape: {data.shape}")
        print(f"Max Precip: {data.max().values:.4f} mm")
        
        if data.max().values > 0:
            print("🌧️  CONFIRMED: Rain detected in production code path!")
        else:
            print("⚠️  Result is still all zeros (might be dry weather OR bug persists).")
            
    except Exception as e:
        print(f"❌ Function call failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify_fix()
