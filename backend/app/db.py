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
        
        db_url = settings.DATABASE_URL
        # Replace SQLAlchemy-style asyncpg scheme if provided in the URL
        if db_url.startswith("postgresql+asyncpg://"):
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        elif db_url.startswith("postgres+asyncpg://"):
            db_url = db_url.replace("postgres+asyncpg://", "postgresql://", 1)
        elif db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
        
        print(f"Connecting to database with DSN parameters... (pool size: 1-10)")
        self.pool = await asyncpg.create_pool(
            dsn=db_url,
            min_size=1,
            max_size=10
        )

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

