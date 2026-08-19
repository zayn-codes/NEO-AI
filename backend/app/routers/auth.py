from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
import asyncpg
import jwt
import bcrypt
import json
import random
from app.db import get_db
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Pydantic schemas for request/response validation
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: str
    preferred_language: Optional[str] = "en"
    native_language: Optional[str] = "en"
    target_language: Optional[str] = "en"
    age: Optional[int] = None
    education_level: Optional[str] = None

class UserLogin(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    password: str

class UserResponse(BaseModel):
    user_id: int
    name: str
    email: str
    preferred_language: str
    native_language: str
    target_language: str
    streak_count: int
    age: Optional[int]
    education_level: Optional[str]
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class QuizAnswerItem(BaseModel):
    question_id: str
    selected_option: str
    correct_answer: Optional[str] = None


class RegisterWithPlacement(BaseModel):
    name: str
    email: EmailStr
    password: str
    preferred_language: Optional[str] = "en"
    native_language: Optional[str] = "en"
    target_language: Optional[str] = "en"

    age: Optional[int] = 18
    schooling_level: Optional[str] = "none"
    quiz_answers: Optional[List[QuizAnswerItem]] = []

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str

def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode('utf-8')
    try:
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: asyncpg.Connection = Depends(get_db)):
    """
    Registers a new user on the platform. Hashes the password and checks for existing emails.
    """
    hashed = hash_password(user_data.password)
    
    try:
        row = await db.fetchrow(
            """
            INSERT INTO users (name, email, password_hash, preferred_language, native_language, target_language, streak_count, last_active_date, age, education_level, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10)
            RETURNING user_id, name, email, preferred_language, native_language, target_language, streak_count, age, education_level, created_at
            """,
            user_data.name,
            user_data.email,
            hashed,
            user_data.preferred_language,
            user_data.native_language,
            user_data.target_language,
            datetime.now(timezone.utc).date(),
            user_data.age,
            user_data.education_level,
            datetime.now(timezone.utc).replace(tzinfo=None)
        )
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )
    
    user_obj = UserResponse(**row)
    token = create_access_token({"sub": str(user_obj.user_id), "email": user_obj.email})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_obj
    }


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: asyncpg.Connection = Depends(get_db)):
    """
    Authenticates a user via email/username and password. Returns access token and user info.
    """
    login_email = credentials.email or credentials.username
    if not login_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email or username is required."
        )

    row = await db.fetchrow(
        """
        SELECT user_id, name, email, password_hash, preferred_language, native_language, target_language, streak_count, last_active_date, age, education_level, created_at
        FROM users
        WHERE email = $1
        """,
        login_email
    )
    
    if not row or not verify_password(credentials.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )
        
    # Process daily streak
    current_streak = row["streak_count"] or 0
    last_active = row["last_active_date"]
    today = datetime.now(timezone.utc).date()
    new_streak = current_streak
    
    if last_active is None:
        new_streak = 1
    else:
        delta = (today - last_active).days
        if delta == 1:
            new_streak = current_streak + 1
        elif delta > 1:
            new_streak = 1
            
    updated_row = await db.fetchrow(
        """
        UPDATE users
        SET streak_count = $1, last_active_date = $2
        WHERE user_id = $3
        RETURNING user_id, name, email, preferred_language, native_language, target_language, streak_count, age, education_level, created_at
        """,
        new_streak,
        today,
        row["user_id"]
    )
    
    try:
        await db.execute(
            """
            INSERT INTO user_gamification (user_id, streak_count, last_login_date)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id) DO UPDATE
            SET streak_count = EXCLUDED.streak_count, last_login_date = EXCLUDED.last_login_date;
            """,
            row["user_id"], new_streak, today
        )
    except Exception as e:
        print(f"[WARN] Failed to sync user_gamification on login: {e}")
    
    user_obj = UserResponse(**updated_row)
    token = create_access_token({"sub": str(user_obj.user_id), "email": user_obj.email})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_obj
    }


@router.get("/placement-quiz")
async def get_placement_quiz(
    target_lang: Optional[str] = "en",
    native_lang: Optional[str] = "en",
    edu_level: Optional[str] = "primary"
):
    """
    Returns 10 benchmark placement check questions for onboarding registration.
    Delegates to registration-quiz generator with unique seed.
    """
    from app.routers.assessment import get_registration_quiz
    seed_str = f"auth_seed_{random.randint(100000, 999999)}"
    questions = await get_registration_quiz(
        target_lang=target_lang,
        native_lang=native_lang,
        edu_level=edu_level,
        seed=seed_str
    )
    return {"questions": [q.model_dump() if hasattr(q, "model_dump") else q.dict() for q in questions]}


@router.post("/register-with-placement")
async def register_with_placement(data: RegisterWithPlacement, db: asyncpg.Connection = Depends(get_db)):
    """
    Registers a new user and evaluates 10 placement benchmark answers dynamically to set initial proficiency level.
    """
    answers_list = data.quiz_answers or []
    correct_count = 0
    total_q = len(answers_list)
    
    legacy_correct_map = {
        "q1": "A",
        "q2": "rises",
        "q3": "I am learning to read."
    }

    beginner_correct, intermediate_correct, advanced_correct = 0, 0, 0
    if total_q > 0:
        for idx, ans in enumerate(answers_list):
            user_val = (ans.selected_option or "").strip().lower()
            if ans.correct_answer:
                target_val = ans.correct_answer.strip().lower()
                is_corr = (user_val == target_val)
            else:
                target_val = legacy_correct_map.get(ans.question_id, "").strip().lower()
                is_corr = bool(target_val and user_val == target_val)
            
            if is_corr:
                correct_count += 1
                if idx < 4:
                    beginner_correct += 1
                elif idx < 7:
                    intermediate_correct += 1
                else:
                    advanced_correct += 1

        score_pct = round((correct_count / total_q) * 100)
    else:
        score_pct = 50

    r_score = round((beginner_correct / 4) * 100) if total_q >= 4 else score_pct
    w_score = round((intermediate_correct / 3) * 100) if total_q >= 7 else score_pct
    c_score = round((advanced_correct / 3) * 100) if total_q >= 10 else score_pct

    if correct_count >= 8:
        assigned_level = "Advanced"
    elif correct_count >= 5:
        assigned_level = "Intermediate"
    else:
        assigned_level = "Beginner"

        
    hashed = hash_password(data.password)
    try:
        row = await db.fetchrow(
            """
            INSERT INTO users (name, email, password_hash, preferred_language, native_language, target_language, streak_count, last_active_date, age, education_level, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9, $10)
            RETURNING user_id, name, email, preferred_language, native_language, target_language, streak_count, age, education_level, created_at
            """,
            data.name,
            data.email,
            hashed,
            data.preferred_language or "en",
            data.native_language or "en",
            data.target_language or "en",

            datetime.now(timezone.utc).date(),
            data.age or 18,
            data.schooling_level or "none",
            datetime.now(timezone.utc).replace(tzinfo=None)
        )
    except asyncpg.exceptions.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )
        
    user_obj = UserResponse(**row)
    token = create_access_token({"sub": str(user_obj.user_id), "email": user_obj.email})
    
    try:
        await db.execute(
            """
            INSERT INTO learner_scores (user_id, reading_score, writing_score, comprehension_score, overall_proficiency, evaluated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            user_obj.user_id,
            r_score,
            w_score,
            c_score,
            assigned_level,
            datetime.now(timezone.utc).replace(tzinfo=None)
        )
    except Exception as e:
        print(f"[WARN] Failed inserting placement score history: {e}")

        
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user_obj,
        "proficiency_level": assigned_level
    }


class UserProfileUpdate(BaseModel):
    user_id: int
    name: str
    preferred_language: str
    native_language: str
    target_language: str
    age: Optional[int] = None
    education_level: Optional[str] = None


class ScoreHistoryResponse(BaseModel):
    score_id: int
    user_id: int
    reading_score: int
    writing_score: int
    comprehension_score: int
    detailed_responses: Optional[List[Dict[str, Any]]] = None
    overall_proficiency: str
    evaluated_at: datetime


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UserProfileUpdate, 
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Updates the user's settings and preferences in the database.
    """
    try:
        row = await db.fetchrow(
            """
            UPDATE users 
            SET name = $1, preferred_language = $2, native_language = $3, target_language = $4, age = $5, education_level = $6
            WHERE user_id = $7
            RETURNING user_id, name, email, preferred_language, native_language, target_language, streak_count, age, education_level, created_at;
            """,
            profile_data.name,
            profile_data.preferred_language,
            profile_data.native_language,
            profile_data.target_language,
            profile_data.age,
            profile_data.education_level,
            profile_data.user_id
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(e)}"
        )
        
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
        
    return UserResponse(**row)


@router.get("/history/{user_id}", response_model=List[ScoreHistoryResponse])
async def get_score_history(
    user_id: int, 
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Retrieves the chronological diagnostic history for a specific user.
    """
    rows = await db.fetch(
        """
        SELECT score_id, user_id, reading_score, writing_score, comprehension_score, overall_proficiency, evaluated_at
        FROM learner_scores
        WHERE user_id = $1
        ORDER BY evaluated_at DESC;
        """,
        user_id
    )
    
    results = []
    for row in rows:
        results.append(
            ScoreHistoryResponse(
                score_id=row["score_id"],
                user_id=row["user_id"],
                reading_score=row["reading_score"],
                writing_score=row["writing_score"],
                comprehension_score=row["comprehension_score"],
                detailed_responses=None,
                overall_proficiency=row["overall_proficiency"],
                evaluated_at=row["evaluated_at"]
            )
        )
    return results


@router.delete("/profile/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    user_id: int,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Deletes a user and their associated data from the database.
    """
    try:
        await db.execute("DELETE FROM user_attempts WHERE user_id = $1;", user_id)
        await db.execute("DELETE FROM user_lesson_status WHERE user_id = $1;", user_id)
        await db.execute("DELETE FROM learner_scores WHERE user_id = $1;", user_id)
        await db.execute("DELETE FROM users WHERE user_id = $1;", user_id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete profile: {str(e)}"
        )
    return


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: asyncpg.Connection = Depends(get_db)):
    """
    Initiates password reset process. Generates a 6-digit numeric token.
    """
    user = await db.fetchrow("SELECT user_id FROM users WHERE email = $1", req.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with this email does not exist."
        )

    token = f"{random.randint(100000, 999999)}"
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=15)

    await db.execute(
        """
        INSERT INTO password_resets (email, token, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO UPDATE
        SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at;
        """,
        req.email,
        token,
        expires_at
    )
    
    print(f"[FORGOT PASSWORD] Generated recovery code for {req.email}: {token}")
    return {
        "message": "Verification code sent successfully.",
        "token": token
    }


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: asyncpg.Connection = Depends(get_db)):
    """
    Verifies reset token and updates the user's password.
    """
    record = await db.fetchrow(
        "SELECT token, expires_at FROM password_resets WHERE email = $1",
        req.email
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No password reset request found for this email."
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if record["expires_at"] < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The verification code has expired."
        )

    if record["token"] != req.token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code."
        )

    hashed = hash_password(req.new_password)

    await db.execute(
        "UPDATE users SET password_hash = $1 WHERE email = $2",
        hashed,
        req.email
    )

    await db.execute("DELETE FROM password_resets WHERE email = $1", req.email)

    return {"message": "Password has been reset successfully."}
