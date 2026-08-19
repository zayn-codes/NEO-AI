from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import asyncpg
from app.db import get_db

router = APIRouter(prefix="/api/attempts", tags=["Attempts & History"])

# Request/Response schemas
class AttemptRecord(BaseModel):
    user_id: int
    lesson_id: Optional[int] = None
    question_id: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    question_text: Optional[str] = ""

class AttemptResponseSchema(BaseModel):
    attempt_id: int
    user_id: int
    lesson_id: Optional[int]
    question_id: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    question_text: Optional[str] = ""
    attempted_at: datetime

class CompletionResponseSchema(BaseModel):
    lesson_id: int
    is_completed: bool
    completed_at: datetime


@router.post("/record", response_model=AttemptResponseSchema, status_code=status.HTTP_201_CREATED)
async def record_attempt(
    record: AttemptRecord,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Saves a single question attempt to history.
    If the attempt is correct and is part of a lesson exercise, mark that lesson as completed.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        # 1. Insert attempt
        row = await db.fetchrow(
            """
            INSERT INTO user_attempts (user_id, lesson_id, question_id, user_answer, correct_answer, is_correct, question_text, attempted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING attempt_id, user_id, lesson_id, question_id, user_answer, correct_answer, is_correct, question_text, attempted_at;
            """,
            record.user_id,
            record.lesson_id,
            record.question_id,
            record.user_answer,
            record.correct_answer,
            record.is_correct,
            record.question_text or "",
            now
        )
        
        # 2. If it's a full lesson completion exercise attempt (explicit completion checkpoint),
        # mark the lesson as completed in user_lesson_status.
        is_completion_attempt = (
            record.lesson_id is not None 
            and record.is_correct 
            and (
                (record.question_id and "completion" in str(record.question_id).lower()) 
                or str(record.user_answer).lower() == "completed"
            )
        )
        if is_completion_attempt:
            await db.execute(
                """
                INSERT INTO user_lesson_status (user_id, lesson_id, is_completed, completed_at)
                VALUES ($1, $2, TRUE, $3)
                ON CONFLICT (user_id, lesson_id)
                DO UPDATE SET is_completed = TRUE, completed_at = $3;
                """,
                record.user_id,
                record.lesson_id,
                now
            )
            
        return AttemptResponseSchema(**row)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database write error: {str(e)}"
        )


@router.get("/history/{user_id}", response_model=List[AttemptResponseSchema])
async def get_attempt_history(
    user_id: int,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Retrieves chronological attempts history for a user.
    """
    rows = await db.fetch(
        """
        SELECT attempt_id, user_id, lesson_id, question_id, user_answer, correct_answer, is_correct, question_text, attempted_at
        FROM user_attempts
        WHERE user_id = $1
        ORDER BY attempted_at DESC
        LIMIT 100;
        """,
        user_id
    )
    return [AttemptResponseSchema(**row) for row in rows]


@router.get("/completion/{user_id}", response_model=List[int])
async def get_completed_lessons(
    user_id: int,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Retrieves the list of lesson IDs completed by the user.
    """
    rows = await db.fetch(
        """
        SELECT lesson_id
        FROM user_lesson_status
        WHERE user_id = $1 AND is_completed = TRUE;
        """,
        user_id
    )
    return [row["lesson_id"] for row in rows]
