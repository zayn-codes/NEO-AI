from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.db import db_manager
from app.routers import auth, curriculum, assessment, attempts, recommendations, voice, gamification, reports, study_guide, chatbot


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Establish connection pool on startup
    await db_manager.connect()
    
    # Create all Module 1, Module 2, & Module 3 tables if they do not exist
    async with db_manager.pool.acquire() as conn:
        await conn.execute("""
            -- 1. Users Table
            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                preferred_language VARCHAR(50) DEFAULT 'en',
                native_language VARCHAR(50) DEFAULT 'en',
                target_language VARCHAR(50) DEFAULT 'en',
                streak_count INT DEFAULT 1,
                last_active_date DATE DEFAULT CURRENT_DATE,
                age INT NULL,
                education_level VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 2. Curriculum Table
            CREATE TABLE IF NOT EXISTS curriculum (
                curriculum_id SERIAL PRIMARY KEY,
                difficulty_level VARCHAR(50) NOT NULL,
                category VARCHAR(100) NOT NULL,
                sequence_order INT NOT NULL,
                target_language VARCHAR(50) DEFAULT 'en',
                native_language VARCHAR(50) DEFAULT 'en',
                user_id INT NULL
            );

            -- 3. Lessons Table
            CREATE TABLE IF NOT EXISTS lessons (
                lesson_id SERIAL PRIMARY KEY,
                curriculum_id INT REFERENCES curriculum(curriculum_id) ON DELETE CASCADE,
                title_key VARCHAR(255) NOT NULL
            );

            -- 4. Lesson Content Table
            CREATE TABLE IF NOT EXISTS lesson_content (
                content_id SERIAL PRIMARY KEY,
                lesson_id INT REFERENCES lessons(lesson_id) ON DELETE CASCADE,
                language_code VARCHAR(50) NOT NULL,
                translated_title VARCHAR(255) NOT NULL,
                body_text TEXT NOT NULL,
                exercise_data JSONB DEFAULT '[]'::jsonb
            );

            -- 5. Assessments Table
            CREATE TABLE IF NOT EXISTS assessments (
                assessment_id SERIAL PRIMARY KEY,
                assessment_type VARCHAR(50) NOT NULL,
                language_code VARCHAR(50) NOT NULL,
                passage_text TEXT NOT NULL,
                question_data JSONB NOT NULL
            );

            -- 6. Learner Scores Table
            CREATE TABLE IF NOT EXISTS learner_scores (
                score_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                reading_score FLOAT DEFAULT 0,
                writing_score FLOAT DEFAULT 0,
                comprehension_score FLOAT DEFAULT 0,
                overall_proficiency VARCHAR(50) DEFAULT 'Beginner',
                evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 7. User Attempts Table
            CREATE TABLE IF NOT EXISTS user_attempts (
                attempt_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                lesson_id INT NOT NULL,
                question_id INT,
                user_answer TEXT,
                correct_answer TEXT,
                is_correct BOOLEAN DEFAULT FALSE,
                question_text TEXT,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 8. User Lesson Status Table
            CREATE TABLE IF NOT EXISTS user_lesson_status (
                status_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                lesson_id INT NOT NULL,
                is_completed BOOLEAN DEFAULT TRUE,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, lesson_id)
            );

            -- 9. Password Resets Table
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(255) PRIMARY KEY,
                token VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL
            );
            
            -- 10. Learning Path Table
            CREATE TABLE IF NOT EXISTS learning_path (
                path_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                lesson_id INT NOT NULL,
                day_number INT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP NULL,
                UNIQUE(user_id, day_number)
            );

            -- 11. Speech Attempts Table
            CREATE TABLE IF NOT EXISTS speech_attempts (
                attempt_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                lesson_id INT,
                audio_path TEXT,
                transcript TEXT,
                confidence FLOAT DEFAULT 0.9,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 12. Pronunciation Scores Table
            CREATE TABLE IF NOT EXISTS pronunciation_scores (
                score_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                lesson_id INT,
                content_score FLOAT,
                pronunciation_score FLOAT,
                fluency_score FLOAT,
                speech_rate INT,
                pause_count INT,
                overall_score FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 13. Gamification Table
            CREATE TABLE IF NOT EXISTS user_gamification (
                user_id INT PRIMARY KEY,
                xp_points INT DEFAULT 0,
                streak_count INT DEFAULT 1,
                virtual_coins INT DEFAULT 50,
                last_login_date DATE DEFAULT CURRENT_DATE
            );

            -- 14. Badges Table
            CREATE TABLE IF NOT EXISTS user_badges (
                badge_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                badge_type VARCHAR(100) NOT NULL,
                unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 15. Rewards Table
            CREATE TABLE IF NOT EXISTS unlocked_rewards (
                reward_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                item_id VARCHAR(100) NOT NULL,
                unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- 16. Study Time Tracking Table
            CREATE TABLE IF NOT EXISTS user_study_time (
                id SERIAL PRIMARY KEY,
                user_id INT UNIQUE NOT NULL,
                total_seconds INT DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Ensure curriculum has user_id and language columns
            ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS user_id INT NULL;
            ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS target_language VARCHAR(50) DEFAULT 'en';
            ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS native_language VARCHAR(50) DEFAULT 'en';
            ALTER TABLE lesson_content ALTER COLUMN exercise_data DROP NOT NULL;
            ALTER TABLE lesson_content ALTER COLUMN exercise_data SET DEFAULT '[]'::jsonb;
        """)
        print("[INFO] Verified/Created all 16 platform database tables.")

        # Auto-seed initial curriculum and assessments if empty
        try:
            from seed_db import seed_database
            await seed_database(conn)
        except Exception as seed_err:
            print(f"[WARNING] Auto-seeding notice: {seed_err}")
    
    # Check if Gemini API key and Module Gen Key are loaded
    from app.config import settings
    import os
    mod_gen_key = settings.MODULE_GEN_KEY or os.getenv("MODULE_GEN_KEY") or settings.MODULE_GENERATION_KEY or os.getenv("MODULE_GENERATION_KEY") or settings.MODULE_GEN_API_KEY or os.getenv("MODULE_GEN_API_KEY")
    if mod_gen_key:
        print(f"[INFO] Module Generation API Key (MODULE_GEN_KEY) loaded successfully: {mod_gen_key[:6]}...")
    else:
        print("[WARNING] MODULE_GEN_KEY is missing! Using GEMINI_API_KEY as fallback for module generation.")

    api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
    if api_key:
        print(f"[INFO] Gemini API Key loaded successfully: {api_key[:6]}...")
    else:
        print("[WARNING] Gemini API Key is missing! System will fall back to stagnant/persistent local content.")

        
    yield
    # Clean up connection pool on shutdown
    await db_manager.disconnect()

app = FastAPI(
    title="AI-Powered Literacy Assistant API",
    description="Backend API for Module 1, Module 2, & Module 3: Voice Learning & Progress Monitoring Dashboard",
    version="3.0.0",
    lifespan=lifespan
)

# Configure CORS for Local Development and Vercel/Production Deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:3000", "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|.*\.vercel\.app|.*\.onrender\.com)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(curriculum.router)
app.include_router(assessment.router)
app.include_router(attempts.router)
app.include_router(recommendations.router)
app.include_router(voice.router)
app.include_router(gamification.router)
app.include_router(reports.router)
app.include_router(study_guide.router)
app.include_router(chatbot.router, prefix="/api/chatbot", tags=["chatbot"])


@app.get("/")
async def root():
    return {
        "status": "online",
        "message": "Welcome to the AI-Powered Literacy Assistant API. The system is active and ready."
    }

