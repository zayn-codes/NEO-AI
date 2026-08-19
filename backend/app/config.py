import os
from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/postgres"
    SECRET_KEY: str = "super-secret-neo-literacy-key-12345"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 1 day
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_API_KEYS: Optional[str] = None
    AI_PRACTICE_KEY: Optional[str] = None
    AI_PRACTICE: Optional[str] = None
    MODULE_GEN_KEY: Optional[str] = None
    MODULE_GENERATION_KEY: Optional[str] = None
    MODULE_GEN_API_KEY: Optional[str] = None
    STUDY_GUIDE_KEY: Optional[str] = None
    STUDY_GUIDE_API_KEY: Optional[str] = None
    VOICE_ASSISTANT_KEY: Optional[str] = None
    VOICE_ASSISTANT_API_KEY: Optional[str] = None




    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
