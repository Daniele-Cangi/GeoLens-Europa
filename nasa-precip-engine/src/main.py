"""
NASA IMERG Precipitation Microservice

FastAPI service providing real-time precipitation data for H3 hexagons
from NASA GPM IMERG satellite mission.

ENDPOINTS:
- POST /precip/h3 - Get precipitation for list of H3 cells
- GET /health - Health check
- GET /cache/stats - Cache statistics

USAGE:
    uvicorn main:app --host 0.0.0.0 --port 8001

ENVIRONMENT:
    EARTHDATA_USERNAME - NASA Earthdata username
    EARTHDATA_PASSWORD - NASA Earthdata password
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator

from .config import (
    API_HOST,
    API_PORT,
    MAX_H3_CELLS_PER_REQUEST,
    LOG_LEVEL,
    CORS_ORIGINS,
)
from .imerg_client import load_imerg_cube
from .h3_mapping import sample_precip_for_h3, validate_h3_indices
from .cache import get_cached_cube, set_cached_cube, get_cache_stats

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="NASA IMERG Precipitation Service",
    description="Real-time precipitation data from GPM IMERG for H3 hexagons",
    version="1.0.0"
)

# CORS middleware (allow GeoLens frontend/backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === PYDANTIC MODELS ===

class PrecipRequest(BaseModel):
    """Request model for precipitation query"""

    h3_indices: List[str] = Field(
        ...,
        description="List of H3 cell indices (any resolution)",
        min_items=1,
        max_items=MAX_H3_CELLS_PER_REQUEST
    )

    t_ref: Optional[str] = Field(
        None,
        description="Reference timestamp (ISO 8601 format). Defaults to now."
    )

    hours_24: bool = Field(
        True,
        description="Include 24-hour precipitation accumulation"
    )

    hours_72: bool = Field(
        True,
        description="Include 72-hour precipitation accumulation"
    )

    @validator('t_ref')
    def validate_t_ref(cls, v):
        """Validate ISO timestamp format"""
        if v is None:
            return None

        try:
            datetime.fromisoformat(v.replace('Z', '+00:00'))
            return v
        except ValueError:
            raise ValueError("t_ref must be valid ISO 8601 timestamp")

    @validator('h3_indices')
    def validate_h3_count(cls, v):
        """Ensure request size is reasonable"""
        if len(v) > MAX_H3_CELLS_PER_REQUEST:
            raise ValueError(
                f"Too many H3 cells requested. Max: {MAX_H3_CELLS_PER_REQUEST}"
            )
        return v


class PrecipCell(BaseModel):
    """Precipitation data for single H3 cell"""

    h3_index: str
    rain24h_mm: Optional[float] = None
    rain72h_mm: Optional[float] = None


class PrecipResponse(BaseModel):
    """Response model for precipitation query"""

    cells: List[PrecipCell]
    source: str = Field(
        ...,
        description="Data source (IMERG-Late, IMERG-Early, or cached)"
    )
    t_ref: str
    cached: bool = Field(
        False,
        description="Whether data was served from cache"
    )


# === ENDPOINTS ===

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "nasa-precip-engine",
        "version": "1.0.0"
    }


@app.get("/cache/stats")
async def cache_statistics():
    """Get cache statistics"""
    return get_cache_stats()


@app.post("/precip/h3", response_model=PrecipResponse)
async def get_precipitation_for_h3(request: PrecipRequest):
    """
    Get precipitation data for H3 hexagons

    This endpoint fetches real-time precipitation from NASA GPM IMERG
    and samples it at the centroids of requested H3 cells.

    Args:
        request: PrecipRequest with H3 indices and time parameters

    Returns:
        PrecipResponse with precipitation values per cell

    Raises:
        HTTPException: If data unavailable or request invalid
    """
    logger.info(f"[API] Received request for {len(request.h3_indices)} H3 cells")

    # Parse reference time
    if request.t_ref:
        try:
            t_ref = datetime.fromisoformat(request.t_ref.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid t_ref timestamp")
    else:
        # Default to 6 hours ago to account for IMERG Early Run latency (~4h)
        t_ref = datetime.utcnow() - timedelta(hours=6)

    # Validate H3 indices
    try:
        valid_h3 = validate_h3_indices(request.h3_indices)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Initialize response cells
    cells: List[PrecipCell] = []

    for h3_idx in valid_h3:
        cells.append(PrecipCell(h3_index=h3_idx))

    source_name = "unknown"
    cached = False

    # Fetch 24h precipitation if requested
    if request.hours_24:
        try:
            # Check cache first
            cube_24h = get_cached_cube(t_ref, 24)

            if cube_24h:
                logger.info("[API] Using cached 24h data")
                precip_data_24h = cube_24h.data
                source_name = cube_24h.source
                cached = True
            else:
                # Load from NASA
                logger.info("[API] Loading 24h data from NASA...")
                precip_data_24h, source_name = load_imerg_cube(t_ref, 24, use_early=True)

                # Cache for future requests
                set_cached_cube(t_ref, 24, precip_data_24h, source_name)

            # Sample at H3 centroids
            precip_24h_map = sample_precip_for_h3(precip_data_24h, valid_h3)

            # Populate response
            for cell in cells:
                cell.rain24h_mm = precip_24h_map.get(cell.h3_index, 0.0)

        except Exception as e:
            logger.error(f"[API] Failed to fetch 24h precipitation: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load 24h precipitation: {str(e)}"
            )

    # Fetch 72h precipitation if requested
    if request.hours_72:
        try:
            # Check cache first
            cube_72h = get_cached_cube(t_ref, 72)

            if cube_72h:
                logger.info("[API] Using cached 72h data")
                precip_data_72h = cube_72h.data
                source_name = cube_72h.source
                cached = True
            else:
                # Load from NASA
                logger.info("[API] Loading 72h data from NASA...")
                precip_data_72h, source_name = load_imerg_cube(t_ref, 72, use_early=True)

                # Cache for future requests
                set_cached_cube(t_ref, 72, precip_data_72h, source_name)

            # Sample at H3 centroids
            precip_72h_map = sample_precip_for_h3(precip_data_72h, valid_h3)

            # Populate response
            for cell in cells:
                cell.rain72h_mm = precip_72h_map.get(cell.h3_index, 0.0)

        except Exception as e:
            logger.error(f"[API] Failed to fetch 72h precipitation: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load 72h precipitation: {str(e)}"
            )

    logger.info(f"[API] ✅ Returning {len(cells)} cells with precipitation data")

    return PrecipResponse(
        cells=cells,
        source=source_name,
        t_ref=t_ref.isoformat(),
        cached=cached
    )


# === STARTUP ===

@app.on_event("startup")
async def startup_event():
    """Log startup information"""
    logger.info("=" * 60)
    logger.info("NASA IMERG Precipitation Microservice")
    logger.info("=" * 60)
    logger.info(f"API Host: {API_HOST}:{API_PORT}")
    logger.info(f"Max H3 cells per request: {MAX_H3_CELLS_PER_REQUEST}")
    logger.info(f"Cache max size: {get_cache_stats()['max_size']}")
    logger.info(f"Cache TTL: {get_cache_stats()['ttl_seconds']}s")
    logger.info("=" * 60)


# === RUN SERVER ===

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=API_HOST,
        port=API_PORT,
        log_level=LOG_LEVEL.lower()
    )
