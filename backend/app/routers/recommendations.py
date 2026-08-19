from fastapi import APIRouter, Depends, Query, Path, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import asyncpg
from app.db import get_db
from app.models import (
    RecommendationRequest, RecommendationResponse,
    FutureProficiencyPredictionRequest, FutureProficiencyPredictionResponse,
    LearningPathItem, LearningPathResponse,
    PersonalizedLearningEngine
)

router = APIRouter(prefix="/api/learning-engine", tags=["Personalized Learning Engine"])


async def _get_personalized_user_lessons(user_id: int, db: asyncpg.Connection):
    user_row = await db.fetchrow("SELECT target_language, native_language FROM users WHERE user_id = $1;", user_id)
    raw_t = (user_row["target_language"] if user_row and user_row.get("target_language") else "en").lower()
    raw_n = (user_row["native_language"] if user_row and user_row.get("native_language") else "en").lower()

    lang_map = {
        "english": "en", "hindi": "hi", "kannada": "kn", "spanish": "es",
        "french": "fr", "german": "de", "tamil": "ta", "telugu": "te",
        "marathi": "mr", "bengali": "bn", "gujarati": "gu", "punjabi": "pa",
        "malayalam": "ml", "japanese": "ja", "chinese": "zh", "arabic": "ar",
        "portuguese": "pt", "russian": "ru", "italian": "it", "korean": "ko",
        "uzbek": "uz", "uz": "uz"
    }
    t_lang = lang_map.get(raw_t, raw_t)
    n_lang = lang_map.get(raw_n, raw_n)

    # 1. Fetch user-specific curriculum matching target & native language
    lessons_rows = await db.fetch(
        """
        SELECT l.lesson_id, l.title_key, lc.translated_title, c.category, c.difficulty_level, c.sequence_order
        FROM lessons l
        JOIN curriculum c ON l.curriculum_id = c.curriculum_id
        LEFT JOIN lesson_content lc ON l.lesson_id = lc.lesson_id AND LOWER(lc.language_code) = $3
        WHERE c.user_id = $1 AND LOWER(c.target_language) = $2 AND LOWER(c.native_language) = $3
        ORDER BY c.sequence_order ASC, l.lesson_id ASC;
        """,
        user_id, t_lang, n_lang
    )

    # Check if existing lessons contain Devanagari when target_language is English
    if lessons_rows and t_lang == "en":
        has_devanagari = any('\u0900' <= char <= '\u097F' for r in lessons_rows for char in ((r.get("translated_title") or "") + (r.get("category") or "")))
        if has_devanagari:
            await db.execute("DELETE FROM learning_path WHERE user_id = $1;", user_id)
            await db.execute("DELETE FROM curriculum WHERE user_id = $1;", user_id)
            lessons_rows = []

    # 2. If user has no curriculum matching current target & native language, generate it!
    if not lessons_rows and user_id:
        # Delete any stale mismatched curriculum rows for this user
        await db.execute("DELETE FROM learning_path WHERE user_id = $1;", user_id)
        await db.execute("DELETE FROM curriculum WHERE user_id = $1;", user_id)

        from app.routers.curriculum import generate_curriculum_outline
        await generate_curriculum_outline(target_lang=t_lang, native_lang=n_lang, db=db, user_id=user_id)
        lessons_rows = await db.fetch(
            """
            SELECT l.lesson_id, l.title_key, lc.translated_title, c.category, c.difficulty_level, c.sequence_order
            FROM lessons l
            JOIN curriculum c ON l.curriculum_id = c.curriculum_id
            LEFT JOIN lesson_content lc ON l.lesson_id = lc.lesson_id AND LOWER(lc.language_code) = $3
            WHERE c.user_id = $1 AND LOWER(c.target_language) = $2 AND LOWER(c.native_language) = $3
            ORDER BY c.sequence_order ASC, l.lesson_id ASC;
            """,
            user_id, t_lang, n_lang
        )

    # 3. Fallback to global curriculum matching target & native language
    if not lessons_rows:
        lessons_rows = await db.fetch(
            """
            SELECT l.lesson_id, l.title_key, lc.translated_title, c.category, c.difficulty_level, c.sequence_order
            FROM lessons l
            JOIN curriculum c ON l.curriculum_id = c.curriculum_id
            LEFT JOIN lesson_content lc ON l.lesson_id = lc.lesson_id AND LOWER(lc.language_code) = $2
            WHERE (c.user_id IS NULL OR c.user_id = 0) AND LOWER(c.target_language) = $1 AND LOWER(c.native_language) = $2
            ORDER BY c.sequence_order ASC, l.lesson_id ASC;
            """,
            t_lang, n_lang
        )

    return [dict(r) for r in lessons_rows], t_lang, n_lang



async def _fetch_recommendations_logic(user_id: int, db: asyncpg.Connection) -> RecommendationResponse:
    # 1. Fetch latest assessment score record
    score_row = await db.fetchrow(
        """
        SELECT reading_score, writing_score, comprehension_score, overall_proficiency
        FROM learner_scores
        WHERE user_id = $1
        ORDER BY evaluated_at DESC
        LIMIT 1;
        """,
        user_id
    )
    
    recent_scores = {"reading": 60.0, "writing": 45.0, "comprehension": 65.0, "listening": 62.0}
    current_proficiency = "Beginner"
    if score_row:
        r_val = float(score_row["reading_score"]) if score_row.get("reading_score") is not None else 60.0
        w_val = float(score_row["writing_score"]) if score_row.get("writing_score") is not None else 45.0
        c_val = float(score_row["comprehension_score"]) if score_row.get("comprehension_score") is not None else 65.0
        # Average reading & comprehension with speech baseline if listening is not stored separately
        l_val = round((r_val * 0.5 + c_val * 0.5), 1)
        recent_scores = {
            "reading": r_val,
            "writing": w_val,
            "comprehension": c_val,
            "listening": l_val
        }
        current_proficiency = score_row["overall_proficiency"] or "Beginner"
        
    # 2. Fetch completed lesson IDs
    completed_rows = await db.fetch(
        "SELECT DISTINCT lesson_id FROM user_attempts WHERE user_id = $1 AND is_correct = TRUE AND lesson_id IS NOT NULL;",
        user_id
    )
    completed_lessons = [r["lesson_id"] for r in completed_rows]
    
    # 3. Fetch user's personalized curriculum lessons
    all_lessons, _, _ = await _get_personalized_user_lessons(user_id=user_id, db=db)
    if not all_lessons:
        all_lessons = [
            {"lesson_id": 1, "title_key": "lesson_alphabet_sounds", "translated_title": "Alphabets & Phonetics", "category": "Alphabet", "difficulty_level": "Beginner"},
            {"lesson_id": 2, "title_key": "lesson_daily_greetings", "translated_title": "Daily Greetings & Expressions", "category": "Basic Words", "difficulty_level": "Beginner"},
            {"lesson_id": 3, "title_key": "lesson_simple_actions", "translated_title": "Simple Daily Sentences", "category": "Simple Sentences", "difficulty_level": "Beginner"},
            {"lesson_id": 4, "title_key": "lesson_market_items", "translated_title": "Market & Shopping Vocabulary", "category": "Vocabulary", "difficulty_level": "Intermediate"},
            {"lesson_id": 5, "title_key": "lesson_farmer_story", "translated_title": "Short Story Reading", "category": "Paragraph Reading", "difficulty_level": "Intermediate"},
            {"lesson_id": 6, "title_key": "lesson_action_verbs", "translated_title": "Action Verbs & Grammar", "category": "Grammar", "difficulty_level": "Intermediate"},
            {"lesson_id": 7, "title_key": "lesson_letter_format", "translated_title": "Formal Letter & Essay Writing", "category": "Essay Writing", "difficulty_level": "Advanced"},
        ]
    
    req = RecommendationRequest(
        user_id=user_id,
        current_proficiency=current_proficiency,
        completed_lessons=completed_lessons,
        recent_scores=recent_scores
    )
    
    return PersonalizedLearningEngine.recommend_lessons(req, all_lessons)


# ==========================================
# 1. RECOMMENDATIONS ENDPOINT
# ==========================================
@router.get("/recommendations", response_model=RecommendationResponse)
async def get_recommendations_query(
    user_id: int = Query(101, description="ID of the user"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Fetch recommendations via query parameter ?user_id=101"""
    return await _fetch_recommendations_logic(user_id=user_id, db=db)


@router.get("/recommendations/{user_id}", response_model=RecommendationResponse)
async def get_recommendations_path(
    user_id: int = Path(..., description="ID of the user"),
    db: asyncpg.Connection = Depends(get_db)
):
    """Fetch recommendations via path parameter /recommendations/101"""
    return await _fetch_recommendations_logic(user_id=user_id, db=db)



# ==========================================
# 2. PROFICIENCY PREDICTION ALGORITHM
# ==========================================
@router.post("/predict-future-proficiency", response_model=FutureProficiencyPredictionResponse)
async def predict_future_proficiency(
    payload: Optional[FutureProficiencyPredictionRequest] = None,
    user_id: Optional[int] = Query(None),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Learner Proficiency Prediction Algorithm.
    Estimates future performance scores (Reading, Writing, Comprehension) over a 2-week period
    based on current scores, practice time, lessons completed, and quiz accuracy.
    """
    if payload is None and user_id is not None:
        # Auto-construct payload from DB user history
        score_row = await db.fetchrow(
            """
            SELECT reading_score, writing_score, comprehension_score
            FROM learner_scores
            WHERE user_id = $1
            ORDER BY evaluated_at DESC
            LIMIT 1;
            """,
            user_id
        )
        r_score = float(score_row["reading_score"]) if score_row else 60.0
        w_score = float(score_row["writing_score"]) if score_row else 45.0
        c_score = float(score_row["comprehension_score"]) if score_row else 65.0
        l_score = round((r_score * 0.5 + c_score * 0.5), 1)
        
        attempts_count = await db.fetchval("SELECT COUNT(*) FROM user_attempts WHERE user_id = $1;", user_id) or 0
        correct_count = await db.fetchval("SELECT COUNT(*) FROM user_attempts WHERE user_id = $1 AND is_correct = TRUE;", user_id) or 0
        track_completed = await db.fetchval("SELECT COUNT(*) FROM learning_path WHERE user_id = $1 AND status = 'completed';", user_id) or 0
        status_completed = await db.fetchval("SELECT COUNT(DISTINCT lesson_id) FROM user_lesson_status WHERE user_id = $1 AND is_completed = TRUE;", user_id) or 0
        
        total_completed_lessons = max(track_completed, status_completed, correct_count)
        accuracy = (correct_count / max(1, attempts_count)) if attempts_count > 0 else 0.75
        
        payload = FutureProficiencyPredictionRequest(
            user_id=user_id,
            reading_score=r_score,
            writing_score=w_score,
            comprehension_score=c_score,
            listening_score=l_score,
            lessons_completed=total_completed_lessons,
            practice_minutes=max(attempts_count * 5, total_completed_lessons * 10),
            quiz_accuracy=accuracy,
            target_weeks=2
        )

    elif payload is None:
        payload = FutureProficiencyPredictionRequest(
            user_id=101,
            reading_score=78.0,
            writing_score=42.0,
            comprehension_score=65.0,
            listening_score=68.0,
            lessons_completed=15,
            practice_minutes=45,
            quiz_accuracy=0.80,
            target_weeks=2
        )
        
    return PersonalizedLearningEngine.predict_future_proficiency(payload)


# ==========================================
# 3. PERSONALIZED LESSON GENERATION WORKFLOW & APIS
# ==========================================
@router.get("/learning-path", response_model=LearningPathResponse)
async def get_learning_path(
    user_id: int = Query(101, description="ID of the user"),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Retrieve the current ordered daily Learning Path for a user.
    If no learning path exists, automatically builds a 7-day personalized schedule.
    """
    user_row = await db.fetchrow("SELECT target_language, native_language FROM users WHERE user_id = $1;", user_id)
    raw_t = (user_row["target_language"] if user_row and user_row.get("target_language") else "en").lower()
    raw_n = (user_row["native_language"] if user_row and user_row.get("native_language") else "en").lower()

    lang_map = {
        "english": "en", "hindi": "hi", "kannada": "kn", "spanish": "es",
        "french": "fr", "german": "de", "tamil": "ta", "telugu": "te",
        "marathi": "mr", "bengali": "bn", "gujarati": "gu", "punjabi": "pa",
        "malayalam": "ml", "japanese": "ja", "chinese": "zh", "arabic": "ar",
        "portuguese": "pt", "russian": "ru", "italian": "it", "korean": "ko",
        "uzbek": "uz", "uz": "uz"
    }
    t_lang = lang_map.get(raw_t, raw_t)
    n_lang = lang_map.get(raw_n, raw_n)

    rows = await db.fetch(
        """
        SELECT lp.path_id, lp.user_id, lp.lesson_id, lp.day_number, lp.status,
               COALESCE(lc.translated_title, l.title_key) as title, c.category, c.difficulty_level,
               c.target_language, c.native_language
        FROM learning_path lp
        JOIN lessons l ON lp.lesson_id = l.lesson_id
        JOIN curriculum c ON l.curriculum_id = c.curriculum_id
        LEFT JOIN lesson_content lc ON l.lesson_id = lc.lesson_id AND LOWER(lc.language_code) = $2
        WHERE lp.user_id = $1
        ORDER BY lp.day_number ASC;
        """,
        user_id, n_lang
    )

    # Check if existing path target language matches current user target_language
    if rows:
        path_t_lang = (rows[0].get("target_language") or "").lower()
        path_t_lang = lang_map.get(path_t_lang, path_t_lang)
        has_devanagari = any('\u0900' <= char <= '\u097F' for r in rows for char in ((r.get("title") or "") + (r.get("category") or "")))
        if path_t_lang != t_lang or (t_lang == "en" and has_devanagari):
            await db.execute("DELETE FROM learning_path WHERE user_id = $1;", user_id)
            await db.execute("DELETE FROM curriculum WHERE user_id = $1;", user_id)
            rows = []

    
    if not rows:
        # Auto-generate dynamic 7-day learning path
        return await generate_learning_path(user_id=user_id, db=db)
        
    # Fetch learner's score context for personalized reason generation
    score_row = await db.fetchrow(
        "SELECT writing_score, reading_score, comprehension_score, overall_proficiency FROM learner_scores WHERE user_id = $1 ORDER BY evaluated_at DESC LIMIT 1;",
        user_id
    )
    r_score = float(score_row["reading_score"]) if score_row else 50.0
    w_score = float(score_row["writing_score"]) if score_row else 50.0
    c_score = float(score_row["comprehension_score"]) if score_row else 50.0
    scores = {"Reading": r_score, "Writing": w_score, "Comprehension": c_score}
    weakest_skill = min(scores, key=scores.get)
    user_proficiency = (score_row["overall_proficiency"] if score_row else "Beginner").capitalize()

    day_reason_templates = [
        lambda r: f"Day 1: Kickstart your {user_proficiency} track with {r.get('category', 'Core')} basics.",
        lambda r: f"Day 2: Targeted practice focusing on your {weakest_skill} skills (currently {scores[weakest_skill]:.0f}%).",
        lambda r: f"Day 3: Progressive building block in {r.get('category', 'Vocabulary')}.",
        lambda r: f"Day 4: Core exercises in {r.get('category', 'Grammar')} tailored to your {user_proficiency} level.",
        lambda r: f"Day 5: Deep-dive session focused on improving {weakest_skill}.",
        lambda r: f"Day 6: Practical vocabulary and sentence structure application.",
        lambda r: f"Day 7: Weekly milestone synthesis & self-check for {user_proficiency} track."
    ]

    items = []
    completed_cnt = 0
    for idx, r in enumerate(rows):
        st = r["status"]
        if st == "completed":
            completed_cnt += 1
        day_num = r["day_number"]
        reason_fn = day_reason_templates[(day_num - 1) % len(day_reason_templates)]
        items.append(
            LearningPathItem(
                path_id=r["path_id"],
                user_id=r["user_id"],
                lesson_id=r["lesson_id"],
                day_number=day_num,
                status=st,
                title=r["title"],
                category=r["category"],
                difficulty_level=r["difficulty_level"],
                reason=reason_fn(dict(r))
            )
        )

        
    return LearningPathResponse(
        user_id=user_id,
        total_days=len(items),
        completed_days=completed_cnt,
        schedule=items
    )


@router.post("/learning-path/generate", response_model=LearningPathResponse)
async def generate_learning_path(
    user_id: int = Query(101, description="ID of the user"),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Generates a personalized daily learning schedule (Day 1, Day 2, Day 3...)
    matching learner skill deficiencies and saves it to PostgreSQL `learning_path` table.
    """
    # 1. Fetch available lessons for user's personalized curriculum matching their exact target & native language
    lessons, _, _ = await _get_personalized_user_lessons(user_id=user_id, db=db)

    if not lessons:
        fallback_lessons = [
            {"lesson_id": 1, "title_key": "lesson_alphabet_sounds", "translated_title": "Alphabets & Phonetics", "category": "Alphabet", "difficulty_level": "Beginner"},
            {"lesson_id": 2, "title_key": "lesson_daily_greetings", "translated_title": "Daily Greetings & Expressions", "category": "Basic Words", "difficulty_level": "Beginner"},
            {"lesson_id": 3, "title_key": "lesson_simple_actions", "translated_title": "Simple Daily Sentences", "category": "Simple Sentences", "difficulty_level": "Beginner"},
            {"lesson_id": 4, "title_key": "lesson_market_items", "translated_title": "Market & Shopping Vocabulary", "category": "Vocabulary", "difficulty_level": "Intermediate"},
            {"lesson_id": 5, "title_key": "lesson_farmer_story", "translated_title": "Short Story Reading", "category": "Paragraph Reading", "difficulty_level": "Intermediate"},
            {"lesson_id": 6, "title_key": "lesson_action_verbs", "translated_title": "Action Verbs & Grammar", "category": "Grammar", "difficulty_level": "Intermediate"},
            {"lesson_id": 7, "title_key": "lesson_letter_format", "translated_title": "Formal Letter & Essay Writing", "category": "Essay Writing", "difficulty_level": "Advanced"},
        ]
        return LearningPathResponse(
            user_id=user_id,
            total_days=len(fallback_lessons),
            completed_days=0,
            schedule=[
                LearningPathItem(
                    path_id=idx + 1,
                    user_id=user_id,
                    lesson_id=l["lesson_id"],
                    day_number=idx + 1,
                    status="pending",
                    title=l.get("translated_title") or l["title_key"],
                    category=l["category"],
                    difficulty_level=l["difficulty_level"],
                    reason=f"Day {idx + 1}: Selected for steady daily progress"
                )
                for idx, l in enumerate(fallback_lessons)
            ]
        )

        
    # 2. Fetch user's latest scores, weak skill area, and assigned proficiency level
    score_row = await db.fetchrow(
        "SELECT writing_score, reading_score, comprehension_score, overall_proficiency FROM learner_scores WHERE user_id = $1 ORDER BY evaluated_at DESC LIMIT 1;",
        user_id
    )
    r_score = float(score_row["reading_score"]) if score_row else 50.0
    w_score = float(score_row["writing_score"]) if score_row else 50.0
    c_score = float(score_row["comprehension_score"]) if score_row else 50.0
    scores = {"Reading": r_score, "Writing": w_score, "Comprehension": c_score}
    weakest_skill = min(scores, key=scores.get)
    user_proficiency = (score_row["overall_proficiency"] if score_row else "Beginner").capitalize()

    # Weak skill category mappings
    weakness_category_map = {
        "Writing": ["Grammar", "Simple Sentences", "Essay Writing", "Basic Words", "Verbs and Action Words"],
        "Reading": ["Alphabet", "Alphabets & Sounds", "Paragraph Reading", "Reading and Writing Tasks"],
        "Comprehension": ["Conversational Vocabulary", "Complex Vocabulary", "Reading Comprehension", "Fluency & Conversation"]
    }
    priority_cats = weakness_category_map.get(weakest_skill, [])

    lessons = list(lessons)


    # Priority sorting: front-load lessons matching user's assigned track level and weak skills
    def path_sort_key(l):
        diff = l.get("difficulty_level", "").capitalize()
        cat = l.get("category", "")
        score = 0
        if diff == user_proficiency:
            score += 20
        if any(p_cat.lower() in cat.lower() for p_cat in priority_cats):
            score += 10
        # Preserve progressive sequence
        score -= l.get("sequence_order", 1) * 0.1
        return score

    lessons.sort(key=path_sort_key, reverse=True)
    schedule_lessons = lessons[:7]

    # 3. Clear existing pending path for user and insert new schedule
    await db.execute("DELETE FROM learning_path WHERE user_id = $1 AND status = 'pending';", user_id)

    day_reason_templates = [
        lambda l: f"Day 1: Kickstart your {user_proficiency} track with {l.get('category', 'Core')} basics.",
        lambda l: f"Day 2: Targeted practice focusing on your {weakest_skill} skills (currently {scores[weakest_skill]:.0f}%).",
        lambda l: f"Day 3: Progressive building block in {l.get('category', 'Vocabulary')}.",
        lambda l: f"Day 4: Core exercises in {l.get('category', 'Grammar')} tailored to your {user_proficiency} level.",
        lambda l: f"Day 5: Deep-dive session focused on improving {weakest_skill}.",
        lambda l: f"Day 6: Practical vocabulary and sentence structure application.",
        lambda l: f"Day 7: Weekly milestone synthesis & self-check for {user_proficiency} track."
    ]

    items = []
    for day_num, l in enumerate(schedule_lessons, start=1):
        path_id = await db.fetchval(
            """
            INSERT INTO learning_path (user_id, lesson_id, day_number, status, assigned_at)
            VALUES ($1, $2, $3, 'pending', NOW())
            ON CONFLICT (user_id, day_number) DO UPDATE 
            SET lesson_id = EXCLUDED.lesson_id, status = 'pending'
            RETURNING path_id;
            """,
            user_id, l["lesson_id"], day_num
        )

        display_title = l.get("translated_title") or l.get("title_key") or f"Lesson {day_num}"
        reason_fn = day_reason_templates[(day_num - 1) % len(day_reason_templates)]
        reason = reason_fn(l)

        items.append(
            LearningPathItem(
                path_id=path_id,
                user_id=user_id,
                lesson_id=l["lesson_id"],
                day_number=day_num,
                status="pending",
                title=display_title,
                category=l["category"],
                difficulty_level=l["difficulty_level"],
                reason=reason
            )
        )

        
    return LearningPathResponse(
        user_id=user_id,
        total_days=len(items),
        completed_days=0,
        schedule=items
    )


class CompleteLessonRequest(BaseModel):
    user_id: int
    lesson_id: int
    day_number: Optional[int] = None


@router.put("/learning-path/complete")
async def complete_learning_path_lesson(
    payload: CompleteLessonRequest,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Marks a lesson in the user's Learning Path as completed,
    updating PostgreSQL status and timestamp.
    """
    if payload.day_number is not None:
        result = await db.execute(
            """
            UPDATE learning_path
            SET status = 'completed', completed_at = NOW()
            WHERE user_id = $1 AND day_number = $2;
            """,
            payload.user_id, payload.day_number
        )
    else:
        result = await db.execute(
            """
            UPDATE learning_path
            SET status = 'completed', completed_at = NOW()
            WHERE user_id = $1 AND lesson_id = $2;
            """,
            payload.user_id, payload.lesson_id
        )

    if payload.lesson_id is not None:
        await db.execute(
            """
            INSERT INTO user_lesson_status (user_id, lesson_id, is_completed, completed_at)
            VALUES ($1, $2, TRUE, NOW())
            ON CONFLICT (user_id, lesson_id)
            DO UPDATE SET is_completed = TRUE, completed_at = NOW();
            """,
            payload.user_id, payload.lesson_id
        )
        
    return {
        "status": "success",
        "message": f"Lesson {payload.lesson_id} marked as completed in learning path and lesson status.",
        "user_id": payload.user_id
    }


@router.post("/learning-path/next-week", response_model=LearningPathResponse)
async def generate_next_week_learning_path(
    user_id: int = Query(101, description="ID of the user"),
    week_number: int = Query(2, description="Target week number (e.g. 2 for Days 8-14)"),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Generates next week's 7-day schedule (e.g. Week 2 = Days 8-14, Week 3 = Days 15-21)
    when the learner completes their current week's lessons.
    """
    start_day = max(1, (week_number - 1) * 7 + 1)
    
    # 1. Fetch available lessons from user's personalized curriculum
    lessons, _, _ = await _get_personalized_user_lessons(user_id=user_id, db=db)


    
    fallback_lessons = [
        {"lesson_id": 1, "title_key": "lesson_alphabet_sounds", "translated_title": "Alphabets & Phonetics", "category": "Alphabet", "difficulty_level": "Beginner"},
        {"lesson_id": 2, "title_key": "lesson_daily_greetings", "translated_title": "Daily Greetings & Expressions", "category": "Basic Words", "difficulty_level": "Beginner"},
        {"lesson_id": 3, "title_key": "lesson_simple_actions", "translated_title": "Simple Daily Sentences", "category": "Simple Sentences", "difficulty_level": "Beginner"},
        {"lesson_id": 4, "title_key": "lesson_market_items", "translated_title": "Market & Shopping Vocabulary", "category": "Vocabulary", "difficulty_level": "Intermediate"},
        {"lesson_id": 5, "title_key": "lesson_farmer_story", "translated_title": "Short Story Reading", "category": "Paragraph Reading", "difficulty_level": "Intermediate"},
        {"lesson_id": 6, "title_key": "lesson_action_verbs", "translated_title": "Action Verbs & Grammar", "category": "Grammar", "difficulty_level": "Intermediate"},
        {"lesson_id": 7, "title_key": "lesson_letter_format", "translated_title": "Formal Letter & Essay Writing", "category": "Essay Writing", "difficulty_level": "Advanced"},
    ]
    
    lessons = lessons if lessons else fallback_lessons

    
    # Rotate lessons based on week offset
    offset = (week_number - 1) * 3
    schedule_lessons = [(lessons[(idx + offset) % len(lessons)]) for idx in range(7)]
    
    items = []
    for idx, l in enumerate(schedule_lessons):
        day_num = start_day + idx
        path_id = 200 + day_num
        try:
            path_id = await db.fetchval(
                """
                INSERT INTO learning_path (user_id, lesson_id, day_number, status, assigned_at)
                VALUES ($1, $2, $3, 'pending', NOW())
                ON CONFLICT (user_id, day_number) DO UPDATE 
                SET lesson_id = EXCLUDED.lesson_id, status = 'pending'
                RETURNING path_id;
                """,
                user_id, l["lesson_id"], day_num
            )
        except Exception as e:
            print(f"[WARN] Error creating week {week_number} schedule item: {e}")
            
        display_title = l.get("translated_title") or l.get("title_key") or f"Lesson {day_num}"
        items.append(
            LearningPathItem(
                path_id=path_id or (200 + day_num),
                user_id=user_id,
                lesson_id=l["lesson_id"],
                day_number=day_num,
                status="pending",
                title=display_title,
                category=l["category"],
                difficulty_level=l.get("difficulty_level", "Intermediate"),
                reason=f"Week {week_number} Day {day_num}: Advanced step in learning path"
            )
        )
        
    return LearningPathResponse(
        user_id=user_id,
        total_days=len(items),
        completed_days=0,
        schedule=items
    )


