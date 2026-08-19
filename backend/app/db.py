import os
import ssl
import asyncio
import urllib.parse
# pyrefly: ignore [missing-import]
import asyncpg
from typing import AsyncGenerator
from contextlib import asynccontextmanager
from app.config import settings

class DatabaseManager:
    def __init__(self):
        self.pool = None

    async def connect(self):
        if self.pool is not None:
            return
        
        raw_db_url = os.getenv("DATABASE_URL") or settings.DATABASE_URL
        if not raw_db_url:
            raise ValueError("[ERROR] DATABASE_URL is not set! Please set the DATABASE_URL environment variable in your deployment settings.")
            
        db_url = raw_db_url.strip().strip('"').strip("'")
        
        # Replace SQLAlchemy / legacy schemes
        for prefix in ["postgresql+asyncpg://", "postgres+asyncpg://", "postgres://"]:
            if db_url.startswith(prefix):
                db_url = db_url.replace(prefix, "postgresql://", 1)
                break

        # Parse connection details for safe logging and SSL configuration
        parsed = urllib.parse.urlparse(db_url)
        
        # Mask password for secure logging in Render logs
        safe_netloc = parsed.hostname or "unknown"
        if parsed.port:
            safe_netloc += f":{parsed.port}"
        if parsed.username:
            safe_netloc = f"{parsed.username}@{safe_netloc}"
        print(f"[INFO] Connecting to PostgreSQL at '{safe_netloc}{parsed.path}'...")

        # Check if SSL is required (cloud databases like Render/Neon/Supabase)
        query_params = urllib.parse.parse_qs(parsed.query)
        ssl_mode = query_params.get("sslmode", [None])[0] or query_params.get("ssl", [None])[0]
        
        # Strip query parameters so asyncpg DSN parser receives clean URL
        clean_dsn = urllib.parse.urlunparse((
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            '', '', ''
        ))

        ssl_ctx = None
        is_cloud_db = parsed.hostname and parsed.hostname not in ["localhost", "127.0.0.1", "db"]
        if ssl_mode in ["require", "verify-full", "verify-ca", "prefer", "true"] or is_cloud_db:
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

        # Retry logic with backoff to handle Render DB spin-up and DNS propagation
        max_retries = 5
        for attempt in range(1, max_retries + 1):
            try:
                self.pool = await asyncpg.create_pool(
                    dsn=clean_dsn,
                    ssl=ssl_ctx,
                    min_size=1,
                    max_size=10,
                    command_timeout=60
                )
                print(f"[INFO] Database connection pool established successfully on attempt {attempt}.")
                return
            except Exception as e:
                print(f"[WARNING] Database connection attempt {attempt}/{max_retries} failed: {e}")
                if attempt < max_retries:
                    wait_time = attempt * 3
                    print(f"[INFO] Retrying in {wait_time} seconds...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"[ERROR] Could not connect to database after {max_retries} attempts.")
                    raise e

    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            self.pool = None

db_manager = DatabaseManager()

async def init_db_tables(db: asyncpg.Connection):
    """Ensure study_guide_chapters and study_guide_unlock_tests tables exist."""
    await db.execute("""
        CREATE TABLE IF NOT EXISTS study_guide_chapters (
            chapter_id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            chapter_number INT NOT NULL,
            title VARCHAR(255) NOT NULL,
            summary TEXT,
            content_markdown TEXT NOT NULL,
            target_language VARCHAR(50) DEFAULT 'en',
            native_language VARCHAR(50) DEFAULT 'en',
            difficulty_level VARCHAR(50) DEFAULT 'Beginner',
            is_unlocked BOOLEAN DEFAULT FALSE,
            required_lessons_count INT DEFAULT 2,
            completed_lessons_count INT DEFAULT 0,
            test_passed BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT uq_user_chapter UNIQUE (user_id, chapter_number)
        );

        CREATE TABLE IF NOT EXISTS study_guide_unlock_tests (
            test_id SERIAL PRIMARY KEY,
            chapter_id INT NOT NULL REFERENCES study_guide_chapters(chapter_id) ON DELETE CASCADE,
            user_id INT NOT NULL,
            questions_json JSONB NOT NULL,
            score FLOAT DEFAULT 0.0,
            passed BOOLEAN DEFAULT FALSE,
            attempted_at TIMESTAMP DEFAULT NOW()
        );
    """)

async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    """
    Dependency generator to retrieve a database connection from the pool.
    Auto-releases the connection back to the pool after the request completes.
    """
    if db_manager.pool is None:
        await db_manager.connect()
    
    async with db_manager.pool.acquire() as connection:
        await init_db_tables(connection)
        yield connection

