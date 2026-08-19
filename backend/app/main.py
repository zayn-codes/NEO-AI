from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.db import db_manager
from app.routers import auth, curriculum, assessment, attempts, recommendations, voice, gamification, reports, study_guide, chatbot


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Establish connection pool on startup
    await db_manager.connect()
    
    # Create password_resets, learning_path, & Module 3 tables if they do not exist
    async with db_manager.pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS password_resets (
                email VARCHAR(255) PRIMARY KEY,
                token VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL
            );
            
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

            CREATE TABLE IF NOT EXISTS speech_attempts (
                attempt_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                lesson_id INT,
                audio_path TEXT,
                transcript TEXT,
                confidence FLOAT DEFAULT 0.9,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

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

            CREATE TABLE IF NOT EXISTS user_gamification (
                user_id INT PRIMARY KEY,
                xp_points INT DEFAULT 0,
                streak_count INT DEFAULT 1,
                virtual_coins INT DEFAULT 50,
                last_login_date DATE DEFAULT CURRENT_DATE
            );

            CREATE TABLE IF NOT EXISTS user_badges (
                badge_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                badge_type VARCHAR(100) NOT NULL,
                unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS unlocked_rewards (
                reward_id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                item_id VARCHAR(100) NOT NULL,
                unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            ALTER TABLE curriculum ADD COLUMN IF NOT EXISTS user_id INT NULL;
        """)
        print("[INFO] Verified/Created Module 1, Module 2, & Module 3 database tables.")
    
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

# Configure CORS for React Dev Server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:3000", "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
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

