import asyncio
import asyncpg
import os
import sys

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from app.db import db_manager

async def reset():
    print("Connecting to database...")
    await db_manager.connect()
    
    try:
        async with db_manager.pool.acquire() as conn:
            print("Clearing all generated curriculum, lessons, and content records...")
            # Deleting from curriculum cascades to lessons and lesson_content in PostgreSQL if configured,
            # but to be safe we truncate/delete from all related tables.
            await conn.execute("DELETE FROM lesson_content;")
            await conn.execute("DELETE FROM lessons;")
            await conn.execute("DELETE FROM curriculum;")
            print("Curriculum reset successful! The next time you load the Roadmap on the frontend, a fresh AI-generated curriculum will be built from scratch.")
    except Exception as e:
        print(f"Error resetting curriculum: {e}")
    finally:
        await db_manager.disconnect()

if __name__ == "__main__":
    asyncio.run(reset())
