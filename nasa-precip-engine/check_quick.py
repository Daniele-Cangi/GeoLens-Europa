import logging
import sys
from datetime import datetime, timedelta
sys.path.append(".")

# Configure logging
logging.basicConfig(level=logging.INFO)

from src.imerg_client import authenticate, load_imerg_cube
from src.h3_mapping import sample_precip_for_h3
import h3

def check_quick():
    print("--- Quick Data Check ---")
    try:
        authenticate()
    except Exception as e:
        print(f"Auth failed: {e}")
        return

    # Use 6h latency as in production
    t_ref = datetime.utcnow() - timedelta(hours=6)
    print(f"Reference Time: {t_ref}")
    
    try:
        # Load only 1 hour of data to be fast
        data, source = load_imerg_cube(t_ref, 1, use_early=True)
        
        print(f"\nSource: {source}")
        max_val = data.max().values
        print(f"Max Precip found: {max_val:.4f} mm")
        
        if max_val > 0:
            # Find location of max value
            max_loc = data.where(data == max_val, drop=True)
            if max_loc.size > 0:
                lat_max = float(max_loc.lat[0])
                lon_max = float(max_loc.lon[0])
                print(f"Location of MAX rain: Lat {lat_max}, Lon {lon_max}")
                
                # Test H3 sampling at this location
                print(f"H3 Version check: {dir(h3)}")
                try:
                    h3_index = h3.geo_to_h3(lat_max, lon_max, 7)
                except AttributeError:
                    print("geo_to_h3 not found, trying latlng_to_cell")
                    h3_index = h3.latlng_to_cell(lat_max, lon_max, 7)
                    
                print(f"Generated H3 Index: {h3_index}")
                
                sampled = sample_precip_for_h3(data, [h3_index])
                print(f"Sampled value for {h3_index}: {sampled.get(h3_index)} mm")
                
                if sampled.get(h3_index, 0) > 0:
                    print("✅ H3 SAMPLING WORKS")
                else:
                    print("❌ H3 SAMPLING FAILED (Returned 0)")
                    
            print("RAIN DETECTED")
        else:
            print("NO RAIN DETECTED (Zeros)")
            
    except Exception as e:
        print(f"Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_quick()
