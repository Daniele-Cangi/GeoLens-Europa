"""
Configuration for NASA IMERG precipitation engine

EUROPE BOUNDING BOX:
- Covers entire European continent + Mediterranean
- Matches GeoLens operational area
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# === GEOGRAPHIC COVERAGE ===
# Europe + Mediterranean bbox (used for subsetting IMERG data)
LAT_MIN = 35.0   # Southern Mediterranean
LAT_MAX = 72.0   # Northern Scandinavia
LON_MIN = -10.0  # Western Atlantic (Ireland, Portugal)
LON_MAX = 40.0   # Eastern Europe (extended to Turkey/Caucasus)

# === NASA EARTHDATA CREDENTIALS ===
# Required for accessing GPM IMERG data via GES DISC
# Register at: https://urs.earthdata.nasa.gov/users/new
EARTHDATA_USERNAME = os.getenv('EARTHDATA_USERNAME', '')
EARTHDATA_PASSWORD = os.getenv('EARTHDATA_PASSWORD', '')

# === IMERG DATA CONFIGURATION ===
# GPM IMERG V07 product identifiers
IMERG_PRODUCT_LATE = "GPM_3IMERGHH"  # Late Run (4-18h latency, more accurate)
IMERG_PRODUCT_EARLY = "GPM_3IMERGHHE"  # Early Run (4-6h latency, less accurate)
IMERG_DATASET_VERSION = "07"
IMERG_INTERVAL_MINUTES = 30

# Resolution: 0.1° (~10km at equator)
IMERG_RESOLUTION = 0.1

# === CACHE CONFIGURATION ===
# Maximum entries in in-memory cache (each entry = 1 DataArray cube)
CACHE_MAX_SIZE = 50

# Cache TTL (seconds) - 30 minutes (matches IMERG update frequency)
CACHE_TTL_SECONDS = 1800

# === API CONFIGURATION ===
API_HOST = os.getenv('API_HOST', '0.0.0.0')
API_PORT = int(os.getenv('API_PORT', '8001'))

# Maximum H3 cells per request (prevent DoS)
MAX_H3_CELLS_PER_REQUEST = 10000


# === LOGGING ===
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# === SECURITY ===
# CORS Origins (comma-separated list for strict checking)
# Default: Allow frontend (3000) and API (3003)
CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:3003').split(',')

