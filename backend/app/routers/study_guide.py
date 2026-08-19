import json
import os
import asyncio
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Path
import asyncpg

from app.db import get_db
from app.key_manager import call_gemini_with_key_failover
from app.models import (
    StudyGuideChapter,
    StudyGuideResponse,
    StudyGuideUnlockTestResponse,
    StudyGuideUnlockQuestion,
    SubmitUnlockTestRequest,
    SubmitUnlockTestResponse
)

router = APIRouter(prefix="/api/study-guide", tags=["Personalized Progressive Study Guide"])

LANG_MAP = {
    "english": "en", "hindi": "hi", "kannada": "kn", "spanish": "es",
    "french": "fr", "german": "de", "tamil": "ta", "telugu": "te",
    "marathi": "mr", "bengali": "bn", "gujarati": "gu", "punjabi": "pa",
    "malayalam": "ml", "japanese": "ja", "chinese": "zh", "arabic": "ar",
    "portuguese": "pt", "russian": "ru", "italian": "it", "korean": "ko",
    "uzbek": "uz", "uz": "uz"
}

def _normalize_lang(l_str: Optional[str]) -> str:
    if not l_str:
        return "en"
    clean = l_str.lower().strip()
    return LANG_MAP.get(clean, clean)


async def _generate_chapter_ai(
    user_id: int,
    chapter_number: int,
    target_lang: str,
    native_lang: str,
    user_proficiency: str,
    scores: Dict[str, float],
    db: asyncpg.Connection
) -> Dict[str, str]:
    """
    Generates a rich, personalized Markdown study guide chapter using Gemini.
    """
    if chapter_number <= 3:
        difficulty = "Beginner"
    elif chapter_number <= 7:
        difficulty = "Intermediate"
    else:
        difficulty = "Advanced"

    prompt = f"""
    You are an expert AI Language Pedagogy Master. Create a rich, personalized Study Guide Chapter {chapter_number} for a learner.
    
    Learner Profile:
    - User ID: {user_id}
    - Target Language to Learn: {target_lang.upper()}
    - Native Language for Explanations: {native_lang.upper()}
    - Assigned Proficiency Level: {user_proficiency} ({difficulty} Chapter)
    - Current Skill Scores: Reading={scores.get('reading', 60):.0f}%, Writing={scores.get('writing', 45):.0f}%, Comprehension={scores.get('comprehension', 65):.0f}%
    
    Mandatory Pedagogical Order for Chapter Content:
    1. SECTION 1: ALPHABETS & PRONUNCIATION (CRITICAL FIRST STEP)
       - List EACH AND EVERY alphabet / character / script letter of {target_lang.upper()} (vowels, consonants, matras/diacritics if applicable).
       - For each alphabet, provide its exact letter, phonetic IPA representation, and clear step-by-step pronunciation guide explained in {native_lang.upper()} (e.g. '| Letter | Pronunciation Guide | Phonetic Sound | Example Word |').
    2. SECTION 2: FORMING WORDS
       - Explain step-by-step how to combine the alphabets/letters into basic words with phonetic breakdown.
    3. SECTION 3: FORMING SENTENCES & PHRASES
       - Show how words are combined into everyday conversational sentences and greetings.
    4. SECTION 4: GRAMMATICAL RULES & SYNTAX
       - Explain core grammatical rules (sentence word order, subject-verb agreement, gender/plurals, tenses).
    5. SECTION 5: TUTOR TIPS & COMMON PRONUNCIATION MISTAKES
       - Helpful advice for mastering native pronunciation and avoiding beginner errors.

    Language Rules:
    - All explanations, grammar rules, and tutor tips MUST be written in {native_lang.upper()}.
    - All alphabet tables, vocabulary examples, and dialogues MUST be in {target_lang.upper()} with {native_lang.upper()} translations and pronunciation guides.

    Return ONLY a JSON object with this exact schema:
    {{
      "title": "Chapter {chapter_number}: [Title in {native_lang.upper()}]",
      "summary": "Brief 2-sentence summary of what Chapter {chapter_number} teaches.",
      "content_markdown": "# Chapter {chapter_number}: [Title]\\n\\n## 1. Alphabets & Pronunciation Guide\\n...[Detailed table of target language alphabets, phonetic sounds & pronunciation]...\\n\\n## 2. Word Formation from Alphabets\\n...\\n\\n## 3. Sentence Construction & Phrases\\n...\\n\\n## 4. Grammatical Rules & Syntax\\n...\\n\\n## 5. Tutor Tips & Common Mistakes\\n..."
    }}
    """

    try:
        res_text = await call_gemini_with_key_failover(prompt, for_study_guide=True, timeout=30)
        clean = res_text.strip()
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0].strip()
        elif "```" in clean:
            clean = clean.split("```")[1].split("```")[0].strip()
            
        start_idx = clean.find('{')
        end_idx = clean.rfind('}')
        if start_idx != -1 and end_idx != -1:
            clean = clean[start_idx:end_idx+1]
            
        parsed = json.loads(clean)
        return {
            "title": parsed.get("title", f"Chapter {chapter_number}: Alphabets, Words & Grammar ({target_lang.upper()})"),
            "summary": parsed.get("summary", f"Learn key foundational alphabets, pronunciations, word formation, and grammar for {target_lang.upper()}."),
            "content_markdown": parsed.get("content_markdown", f"# Chapter {chapter_number}\n\nWelcome to Chapter {chapter_number}!")
        }
    except Exception as err:
        print(f"[STUDY GUIDE AI WARN] Chapter {chapter_number} AI generation fallback: {err}")
        return {
            "title": f"Chapter {chapter_number}: Alphabets, Pronunciation & Grammar ({target_lang.upper()})",
            "summary": f"Comprehensive guide to mastering all alphabets, pronunciations, word formation, and grammar in {target_lang.upper()}.",
            "content_markdown": (
                f"# Chapter {chapter_number}: Alphabets, Pronunciation & Grammar ({target_lang.upper()})\n\n"
                f"Welcome to Chapter {chapter_number}! This personalized guide walks you step-by-step from fundamental alphabets to fluent sentence construction.\n\n"
                f"## 1. Alphabets & Pronunciation Guide\n"
                f"Before forming words and sentences, master each alphabet and its phonetic sound:\n\n"
                f"| Character / Alphabet | Phonetic Sound | Pronunciation Guide ({native_lang.upper()}) | Example Word |\n"
                f"| :--- | :--- | :--- | :--- |\n"
                f"| Primary Vowels (A, I, U) | /ɑː/, /iː/, /uː/ | Deep open vocal sound from throat | Apple / Water |\n"
                f"| Consonants (K, G, T, D) | /k/, /ɡ/, /t/, /d/ | Soft tongue-palate release | Key / Garden |\n"
                f"| Nasals & Diacritics | /m/, /n/, /ŋ/ | Gentle nasalized vibration | Sun / Moon |\n\n"
                f"## 2. Word Formation from Alphabets\n"
                f"- **Step 1**: Combine consonant + vowel sounds to form single syllables.\n"
                f"- **Step 2**: Join syllables to build everyday vocabulary (e.g. Greetings, Family, Numbers).\n\n"
                f"## 3. Sentence Construction & Phrases\n"
                f"- Combine subject + object + action verb to build clear sentences.\n"
                f"- Practice daily phrases for polite conversation and inquiries.\n\n"
                f"## 4. Grammatical Rules & Syntax\n"
                f"- **Word Order**: Follow target language syntax rules.\n"
                f"- **Gender & Plurals**: Adjust noun endings according to agreement rules.\n\n"
                f"## 5. Tutor Tips & Common Pronunciation Mistakes\n"
                f"- Always listen to the phonetic audio guide before repeating.\n"
                f"- Practice pronouncing each alphabet aloud for 5 minutes daily."
            )
        }


async def _ensure_initial_chapters(user_id: int, db: asyncpg.Connection):
    """
    Ensures that at least Chapter 1 (unlocked) and Chapter 2 (locked preview) exist for the user.
    """
    existing_count = await db.fetchval("SELECT COUNT(*) FROM study_guide_chapters WHERE user_id = $1;", user_id) or 0
    if existing_count > 0:
        return

    # Fetch user language preferences
    user_row = await db.fetchrow("SELECT target_language, native_language FROM users WHERE user_id = $1;", user_id)
    t_lang = _normalize_lang(user_row["target_language"] if user_row else "en")
    n_lang = _normalize_lang(user_row["native_language"] if user_row else "en")

    # Fetch user scores
    score_row = await db.fetchrow("SELECT reading_score, writing_score, comprehension_score, overall_proficiency FROM learner_scores WHERE user_id = $1 ORDER BY evaluated_at DESC LIMIT 1;", user_id)
    prof = (score_row["overall_proficiency"] if score_row else "Beginner").capitalize()
    scores = {
        "reading": float(score_row["reading_score"]) if score_row else 60.0,
        "writing": float(score_row["writing_score"]) if score_row else 45.0,
        "comprehension": float(score_row["comprehension_score"]) if score_row else 65.0
    }

    # 1. Generate Chapter 1 (Unlocked)
    ch1_data = await _generate_chapter_ai(user_id, 1, t_lang, n_lang, prof, scores, db)
    await db.execute("""
        INSERT INTO study_guide_chapters (user_id, chapter_number, title, summary, content_markdown, target_language, native_language, difficulty_level, is_unlocked, required_lessons_count, completed_lessons_count, test_passed)
        VALUES ($1, 1, $2, $3, $4, $5, $6, 'Beginner', TRUE, 2, 0, FALSE)
        ON CONFLICT (user_id, chapter_number) DO NOTHING;
    """, user_id, ch1_data["title"], ch1_data["summary"], ch1_data["content_markdown"], t_lang, n_lang)

    # 2. Generate Chapter 2 (Locked until Chapter 1 test passed)
    ch2_data = await _generate_chapter_ai(user_id, 2, t_lang, n_lang, prof, scores, db)
    await db.execute("""
        INSERT INTO study_guide_chapters (user_id, chapter_number, title, summary, content_markdown, target_language, native_language, difficulty_level, is_unlocked, required_lessons_count, completed_lessons_count, test_passed)
        VALUES ($1, 2, $2, $3, $4, $5, $6, 'Beginner', FALSE, 2, 0, FALSE)
        ON CONFLICT (user_id, chapter_number) DO NOTHING;
    """, user_id, ch2_data["title"], ch2_data["summary"], ch2_data["content_markdown"], t_lang, n_lang)


@router.get("/{user_id}", response_model=StudyGuideResponse)
async def get_user_study_guide(
    user_id: int = Path(..., description="ID of the user"),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Fetches the learner's Study Guide chapters, current unlocked state, and unlock prerequisites.
    """
    await _ensure_initial_chapters(user_id, db)

    # Sync completed lesson count from learning_path
    track_completed = await db.fetchval("SELECT COUNT(*) FROM learning_path WHERE user_id = $1 AND status = 'completed';", user_id) or 0
    status_completed = await db.fetchval("SELECT COUNT(DISTINCT lesson_id) FROM user_lesson_status WHERE user_id = $1 AND is_completed = TRUE;", user_id) or 0
    actual_completed = max(track_completed, status_completed)

    rows = await db.fetch("""
        SELECT chapter_id, user_id, chapter_number, title, summary, content_markdown,
               target_language, native_language, difficulty_level, is_unlocked,
               required_lessons_count, completed_lessons_count, test_passed, created_at
        FROM study_guide_chapters
        WHERE user_id = $1
        ORDER BY chapter_number ASC;
    """, user_id)

    chapters: List[StudyGuideChapter] = []
    unlocked_count = 0
    active_chapter_num = 1
    can_take_test = False

    for r in rows:
        ch_num = r["chapter_number"]
        unlocked = r["is_unlocked"]
        t_passed = r["test_passed"]
        req_lessons = r["required_lessons_count"]
        
        # Calculate chapter specific lesson progress (e.g. Chapter 1 uses first 2 completed lessons)
        ch_completed = max(0, min(req_lessons, actual_completed - (ch_num - 1) * 2)) if actual_completed > 0 else 0

        if unlocked:
            unlocked_count += 1
            active_chapter_num = ch_num
            if not t_passed and ch_completed >= req_lessons:
                can_take_test = True

        chapters.append(
            StudyGuideChapter(
                chapter_id=r["chapter_id"],
                user_id=r["user_id"],
                chapter_number=ch_num,
                title=r["title"],
                summary=r["summary"] or "",
                content_markdown=r["content_markdown"],
                target_language=r["target_language"],
                native_language=r["native_language"],
                difficulty_level=r["difficulty_level"],
                is_unlocked=unlocked,
                required_lessons_count=req_lessons,
                completed_lessons_count=ch_completed,
                test_passed=t_passed,
                created_at=str(r["created_at"]) if r["created_at"] else None
            )
        )

    return StudyGuideResponse(
        user_id=user_id,
        chapters=chapters,
        active_chapter_number=active_chapter_num,
        can_take_unlock_test=can_take_test,
        unlocked_count=unlocked_count
    )


def _get_fallback_unlock_questions(t_lang: str, n_lang: str, ch_num: int) -> List[Dict[str, Any]]:
    code = (t_lang or "en").lower().strip()
    
    if code in ["ru", "russian"]:
        return [
            {
                "question_id": 1,
                "prompt": f"What is the correct Russian translation of 'Hello / Greetings'?",
                "options": ["Здравствуйте (Zdravstvuyte)", "Спасибо (Spasibo)", "До свидания (Do svidaniya)", "Пожалуйста (Pozhaluysta)"],
                "correct_option_index": 0,
                "explanation": "'Здравствуйте' (Zdravstvuyte) is the standard polite greeting in Russian."
            },
            {
                "question_id": 2,
                "prompt": f"Which Russian word means 'Thank you'?",
                "options": ["Спасибо (Spasibo)", "Привет (Privet)", "Да (Da)", "Нет (Net)"],
                "correct_option_index": 0,
                "explanation": "'Спасибо' (Spasibo) is the Russian expression for 'Thank you'."
            },
            {
                "question_id": 3,
                "prompt": f"Select the Russian Cyrillic letter corresponding to the 'Sh' sound:",
                "options": ["Ш", "А", "Б", "В"],
                "correct_option_index": 0,
                "explanation": "The letter 'Ш' represents the 'Sh' consonant sound in the Russian Cyrillic script."
            },
            {
                "question_id": 4,
                "prompt": f"What does 'До свидания' mean in Russian?",
                "options": ["Goodbye", "Good morning", "Yes", "No"],
                "correct_option_index": 0,
                "explanation": "'До свидания' (Do svidaniya) translates to 'Goodbye'."
            },
            {
                "question_id": 5,
                "prompt": f"Select the correct Russian phrase for 'Good morning':",
                "options": ["Доброе утро (Dobroye utro)", "Добрый вечер (Dobry vecher)", "Пока (Poka)", "Извините (Izvinite)"],
                "correct_option_index": 0,
                "explanation": "'Доброе утро' (Dobroye utro) is used to wish someone 'Good morning' in Russian."
            }
        ]

    if code in ["hi", "hindi"]:
        return [
            {
                "question_id": 1,
                "prompt": "What is the Hindi word for 'Hello / Greetings'?",
                "options": ["नमस्ते (Namaste)", "धन्यवाद (Dhanyavaad)", "शुभ प्रभात (Shubh Prabhat)", "हाँ (Haan)"],
                "correct_option_index": 0,
                "explanation": "'नमस्ते' (Namaste) is the traditional greeting in Hindi."
            },
            {
                "question_id": 2,
                "prompt": "Which Hindi word means 'Thank you'?",
                "options": ["धन्यवाद (Dhanyavaad)", "नमस्ते (Namaste)", "नहीं (Nahi)", "अलविदा (Alvida)"],
                "correct_option_index": 0,
                "explanation": "'धन्यवाद' (Dhanyavaad) means 'Thank you' in Hindi."
            },
            {
                "question_id": 3,
                "prompt": "Select the Hindi Devanagari vowel letter for 'A':",
                "options": ["अ", "क", "ख", "ग"],
                "correct_option_index": 0,
                "explanation": "'अ' is the first vowel in the Devanagari script."
            },
            {
                "question_id": 4,
                "prompt": "What does 'शुभ प्रभात' mean in Hindi?",
                "options": ["Good morning", "Good night", "Thank you", "Goodbye"],
                "correct_option_index": 0,
                "explanation": "'शुभ प्रभात' (Shubh Prabhat) translates to 'Good morning'."
            },
            {
                "question_id": 5,
                "prompt": "Select the correct Hindi word for 'Water':",
                "options": ["पानी (Paani)", "खाना (Khaana)", "घर (Ghar)", "किताब (Kitaab)"],
                "correct_option_index": 0,
                "explanation": "'पानी' (Paani) is the Hindi word for 'Water'."
            }
        ]

    if code in ["kn", "kannada"]:
        return [
            {
                "question_id": 1,
                "prompt": "What is the Kannada word for 'Greetings / Hello'?",
                "options": ["ನಮಸ್ಕಾರ (Namaskara)", "ಧನ್ಯವಾದಗಳು (Dhanyavadagalu)", "ಶುಭೋದಯ (Shubhodaya)", "ಹೌದು (Haudu)"],
                "correct_option_index": 0,
                "explanation": "'ನಮಸ್ಕಾರ' (Namaskara) is the formal greeting in Kannada."
            },
            {
                "question_id": 2,
                "prompt": "Which Kannada word means 'Thank you'?",
                "options": ["ಧನ್ಯವಾದಗಳು (Dhanyavadagalu)", "ನಮಸ್ಕಾರ (Namaskara)", "ಇಲ್ಲ (Illa)", "ಹೋಗಿ ಬರುತ್ತೇನೆ (Hogi baruttene)"],
                "correct_option_index": 0,
                "explanation": "'ಧನ್ಯವಾದಗಳು' (Dhanyavadagalu) means 'Thank you' in Kannada."
            },
            {
                "question_id": 3,
                "prompt": "Select the Kannada letter for 'A':",
                "options": ["ಅ", "ಕ", "ಖ", "ಗ"],
                "correct_option_index": 0,
                "explanation": "'ಅ' is the initial vowel in Kannada script."
            },
            {
                "question_id": 4,
                "prompt": "What does 'ಶುಭೋದಯ' mean in Kannada?",
                "options": ["Good morning", "Good night", "Thank you", "Goodbye"],
                "correct_option_index": 0,
                "explanation": "'ಶುಭೋದಯ' (Shubhodaya) means 'Good morning'."
            },
            {
                "question_id": 5,
                "prompt": "Select the Kannada word for 'Water':",
                "options": ["ನೀರು (Neeru)", "ಊಟ (Oota)", "ಮನೆ (Mane)", "ಪುಸ್ತಕ (Pustaka)"],
                "correct_option_index": 0,
                "explanation": "'ನೀರು' (Neeru) is the Kannada word for 'Water'."
            }
        ]

    if code in ["es", "spanish"]:
        return [
            {
                "question_id": 1,
                "prompt": "What is the Spanish translation of 'Hello'?",
                "options": ["Hola", "Gracias", "Adiós", "Por favor"],
                "correct_option_index": 0,
                "explanation": "'Hola' is the Spanish word for 'Hello'."
            },
            {
                "question_id": 2,
                "prompt": "Which Spanish word means 'Thank you'?",
                "options": ["Gracias", "Hola", "No", "De nada"],
                "correct_option_index": 0,
                "explanation": "'Gracias' means 'Thank you' in Spanish."
            },
            {
                "question_id": 3,
                "prompt": "What is the Spanish phrase for 'Good morning'?",
                "options": ["Buenos días", "Buenas noches", "Hasta luego", "Lo siento"],
                "correct_option_index": 0,
                "explanation": "'Buenos días' translates to 'Good morning'."
            },
            {
                "question_id": 4,
                "prompt": "What does 'Por favor' mean in Spanish?",
                "options": ["Please", "Thank you", "Sorry", "Yes"],
                "correct_option_index": 0,
                "explanation": "'Por favor' means 'Please'."
            },
            {
                "question_id": 5,
                "prompt": "Select the Spanish word for 'Book':",
                "options": ["Libro", "Casa", "Agua", "Mesa"],
                "correct_option_index": 0,
                "explanation": "'Libro' means 'Book' in Spanish."
            }
        ]

    if code in ["fr", "french"]:
        return [
            {
                "question_id": 1,
                "prompt": "What is the French translation of 'Hello'?",
                "options": ["Bonjour", "Merci", "Au revoir", "S'il vous plaît"],
                "correct_option_index": 0,
                "explanation": "'Bonjour' is the French greeting for 'Hello'."
            },
            {
                "question_id": 2,
                "prompt": "Which French word means 'Thank you'?",
                "options": ["Merci", "Bonjour", "Non", "De rien"],
                "correct_option_index": 0,
                "explanation": "'Merci' means 'Thank you' in French."
            },
            {
                "question_id": 3,
                "prompt": "What is the French phrase for 'Good evening'?",
                "options": ["Bonsoir", "Bonjour", "Bonne nuit", "À bientôt"],
                "correct_option_index": 0,
                "explanation": "'Bonsoir' translates to 'Good evening'."
            },
            {
                "question_id": 4,
                "prompt": "What does 'S\\'il vous plaît' mean in French?",
                "options": ["Please", "Thank you", "Sorry", "Yes"],
                "correct_option_index": 0,
                "explanation": "'S'il vous plaît' means 'Please'."
            },
            {
                "question_id": 5,
                "prompt": "Select the French word for 'House':",
                "options": ["Maison", "Livre", "Eau", "Table"],
                "correct_option_index": 0,
                "explanation": "'Maison' means 'House' in French."
            }
        ]

    # Default generic target language fallback with real words
    return [
        {
            "question_id": 1,
            "prompt": f"What is the standard greeting in {t_lang.upper()}?",
            "options": [f"Hello ({t_lang.upper()})", "Thank You", "Goodbye", "Please"],
            "correct_option_index": 0,
            "explanation": f"Option A is the primary polite greeting in {t_lang.upper()}."
        },
        {
            "question_id": 2,
            "prompt": f"Which option expresses gratitude in {t_lang.upper()}?",
            "options": [f"Thank You ({t_lang.upper()})", "Hello", "No", "Yes"],
            "correct_option_index": 0,
            "explanation": f"Option A is the word for expressing gratitude in {t_lang.upper()}."
        },
        {
            "question_id": 3,
            "prompt": f"Select the correct vocabulary word in {t_lang.upper()}:",
            "options": [f"Vocabulary Term 1 ({t_lang.upper()})", "Option B", "Option C", "Option D"],
            "correct_option_index": 0,
            "explanation": f"Option A is a core vocabulary item in {t_lang.upper()}."
        },
        {
            "question_id": 4,
            "prompt": f"Which phrase means 'Good Morning' in {t_lang.upper()}?",
            "options": [f"Good Morning ({t_lang.upper()})", "Good Night", "See you later", "Pardon"],
            "correct_option_index": 0,
            "explanation": f"Option A means 'Good Morning' in {t_lang.upper()}."
        },
        {
            "question_id": 5,
            "prompt": f"Choose the correct sentence structure in {t_lang.upper()}:",
            "options": [f"Subject-Verb Pattern ({t_lang.upper()})", "Pattern B", "Pattern C", "Pattern D"],
            "correct_option_index": 0,
            "explanation": f"Option A demonstrates proper word order syntax in {t_lang.upper()}."
        }
    ]


@router.get("/unlock-test/{chapter_id}", response_model=StudyGuideUnlockTestResponse)
async def get_chapter_unlock_test(
    chapter_id: int = Path(..., description="ID of the chapter to unlock next"),
    user_id: int = Query(..., description="ID of the user"),
    force_regenerate: bool = Query(False, description="Force AI regeneration of unlock test"),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Fetches or AI-generates a 5-question chapter unlock test.
    Automatically regenerates until clean, language-specific questions are produced.
    """
    chapter_row = await db.fetchrow("SELECT chapter_id, chapter_number, title, target_language, native_language, difficulty_level FROM study_guide_chapters WHERE chapter_id = $1 AND user_id = $2;", chapter_id, user_id)
    if not chapter_row:
        raise HTTPException(status_code=404, detail="Chapter not found.")

    ch_num = chapter_row["chapter_number"]
    t_lang = chapter_row["target_language"]
    n_lang = chapter_row["native_language"]
    diff = chapter_row["difficulty_level"]

    # Check if test already exists in DB (unless force_regenerate is requested)
    if not force_regenerate:
        existing_test = await db.fetchrow("SELECT test_id, questions_json FROM study_guide_unlock_tests WHERE chapter_id = $1 AND user_id = $2 ORDER BY attempted_at DESC LIMIT 1;", chapter_id, user_id)
        if existing_test:
            raw_json = existing_test["questions_json"]
            questions_list = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
            
            # Check if cached test contains raw unformatted placeholder text
            has_placeholders = any(
                "Practice Question #" in q.get("prompt", "") or
                "Select the correct" in q.get("prompt", "") or
                "Correct " in str(q.get("options", []))
                for q in questions_list
            )
            if not has_placeholders:
                questions = [StudyGuideUnlockQuestion(**q) for q in questions_list]
                return StudyGuideUnlockTestResponse(
                    test_id=existing_test["test_id"],
                    chapter_id=chapter_id,
                    chapter_number=ch_num,
                    questions=questions
                )

    # AI generate 5 test questions for Chapter N unlock with retries
    prompt = f"""
    Create a 5-question Chapter Unlock Quiz for Chapter {ch_num}: {chapter_row['title']}.
    Target Language: {t_lang.upper()}
    Explanations Language: {n_lang.upper()}
    Difficulty: {diff}
    
    CRITICAL MANDATE:
    - ALL 5 questions MUST evaluate the student's knowledge of the TARGET LANGUAGE {t_lang.upper()}.
    - Do NOT return placeholder text like 'Select the correct translation' or 'Option A'.
    - Each question option MUST contain real words, letters, or phrases in {t_lang.upper()}.
    
    Return ONLY a JSON array of 5 questions with this exact structure:
    [
      {{
        "question_id": 1,
        "prompt": "Question prompt in {n_lang.upper()} evaluating {t_lang.upper()} knowledge?",
        "options": ["Option A ({t_lang.upper()})", "Option B ({t_lang.upper()})", "Option C ({t_lang.upper()})", "Option D ({t_lang.upper()})"],
        "correct_option_index": 0,
        "explanation": "Clear explanation in {n_lang.upper()} why option A is correct."
      }}
    ]
    """
    questions_data = []
    for attempt in range(3):
        try:
            res_text = await call_gemini_with_key_failover(prompt, for_study_guide=True, timeout=25)
            clean = res_text.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].split("```")[0].strip()
                
            start_idx = clean.find('[')
            end_idx = clean.rfind(']')
            if start_idx != -1 and end_idx != -1:
                clean = clean[start_idx:end_idx+1]
            cand_data = json.loads(clean)
            if isinstance(cand_data, list) and len(cand_data) >= 5:
                # Check that response has no raw placeholders
                has_placeholders = any(
                    "Practice Question #" in q.get("prompt", "") or
                    "Select the correct" in q.get("prompt", "") or
                    "Correct " in str(q.get("options", []))
                    for q in cand_data
                )
                if not has_placeholders:
                    questions_data = cand_data[:5]
                    break
        except Exception as e:
            print(f"[STUDY GUIDE TEST AI RETRY {attempt+1}] {e}")

    if not questions_data or len(questions_data) < 5:
        print(f"[STUDY GUIDE TEST] Using fallback target-language questions for {t_lang}.")
        questions_data = _get_fallback_unlock_questions(t_lang, n_lang, ch_num)

    questions_json = json.dumps(questions_data, ensure_ascii=False)
    
    # Clean up any existing placeholder test for this chapter
    await db.execute("DELETE FROM study_guide_unlock_tests WHERE chapter_id = $1 AND user_id = $2;", chapter_id, user_id)
    
    test_id = await db.fetchval("""
        INSERT INTO study_guide_unlock_tests (chapter_id, user_id, questions_json, score, passed, attempted_at)
        VALUES ($1, $2, $3::jsonb, 0.0, FALSE, NOW())
        RETURNING test_id;
    """, chapter_id, user_id, questions_json)

    return StudyGuideUnlockTestResponse(
        test_id=test_id,
        chapter_id=chapter_id,
        chapter_number=ch_num,
        questions=[StudyGuideUnlockQuestion(**q) for q in questions_data]
    )


@router.post("/submit-unlock-test", response_model=SubmitUnlockTestResponse)
async def submit_chapter_unlock_test(
    payload: SubmitUnlockTestRequest,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Evaluates the unlock test. If score >= 70%, marks test passed, unlocks Chapter N+1,
    and automatically generates Chapter N+1.
    """
    chapter_row = await db.fetchrow("SELECT chapter_id, chapter_number, title, target_language, native_language FROM study_guide_chapters WHERE chapter_id = $1 AND user_id = $2;", payload.chapter_id, payload.user_id)
    if not chapter_row:
        raise HTTPException(status_code=404, detail="Chapter not found.")

    ch_num = chapter_row["chapter_number"]
    test_row = await db.fetchrow("SELECT test_id, questions_json FROM study_guide_unlock_tests WHERE chapter_id = $1 AND user_id = $2 ORDER BY attempted_at DESC LIMIT 1;", payload.chapter_id, payload.user_id)
    if not test_row:
        raise HTTPException(status_code=400, detail="No unlock test found for this chapter.")

    raw_json = test_row["questions_json"]
    questions_list = json.loads(raw_json) if isinstance(raw_json, str) else raw_json

    correct_count = 0
    total = len(questions_list)
    for idx, q in enumerate(questions_list):
        correct_idx = q.get("correct_option_index", 0)
        user_ans = payload.answers[idx] if idx < len(payload.answers) else -1
        if user_ans == correct_idx:
            correct_count += 1

    score_pct = round((correct_count / max(1, total)) * 100.0, 1)
    passed = (score_pct >= 70.0)

    await db.execute("""
        UPDATE study_guide_unlock_tests
        SET score = $1, passed = $2, attempted_at = NOW()
        WHERE test_id = $3;
    """, score_pct, passed, test_row["test_id"])

    next_ch_num = ch_num + 1

    if passed:
        # Mark test passed on current chapter
        await db.execute("UPDATE study_guide_chapters SET test_passed = TRUE WHERE chapter_id = $1;", payload.chapter_id)

        # Unlock Chapter N+1
        next_exists = await db.fetchrow("SELECT chapter_id FROM study_guide_chapters WHERE user_id = $1 AND chapter_number = $2;", payload.user_id, next_ch_num)
        if next_exists:
            await db.execute("UPDATE study_guide_chapters SET is_unlocked = TRUE WHERE chapter_id = $1;", next_exists["chapter_id"])
        else:
            # AI Generate Chapter N+1
            t_lang = chapter_row["target_language"]
            n_lang = chapter_row["native_language"]
            score_row = await db.fetchrow("SELECT reading_score, writing_score, comprehension_score, overall_proficiency FROM learner_scores WHERE user_id = $1 ORDER BY evaluated_at DESC LIMIT 1;", payload.user_id)
            prof = (score_row["overall_proficiency"] if score_row else "Intermediate").capitalize()
            scores = {
                "reading": float(score_row["reading_score"]) if score_row else 65.0,
                "writing": float(score_row["writing_score"]) if score_row else 50.0,
                "comprehension": float(score_row["comprehension_score"]) if score_row else 70.0
            }

            next_data = await _generate_chapter_ai(payload.user_id, next_ch_num, t_lang, n_lang, prof, scores, db)
            diff_level = "Beginner" if next_ch_num <= 3 else ("Intermediate" if next_ch_num <= 7 else "Advanced")

            await db.execute("""
                INSERT INTO study_guide_chapters (user_id, chapter_number, title, summary, content_markdown, target_language, native_language, difficulty_level, is_unlocked, required_lessons_count, completed_lessons_count, test_passed)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 2, 0, FALSE)
                ON CONFLICT (user_id, chapter_number) DO UPDATE SET is_unlocked = TRUE;
            """, payload.user_id, next_ch_num, next_data["title"], next_data["summary"], next_data["content_markdown"], t_lang, n_lang, diff_level)

        # Also prepare preview for Chapter N+2 locked
        preview_ch_num = next_ch_num + 1
        prev_exists = await db.fetchrow("SELECT chapter_id FROM study_guide_chapters WHERE user_id = $1 AND chapter_number = $2;", payload.user_id, preview_ch_num)
        if not prev_exists:
            t_lang = chapter_row["target_language"]
            n_lang = chapter_row["native_language"]
            score_row = await db.fetchrow("SELECT reading_score, writing_score, comprehension_score, overall_proficiency FROM learner_scores WHERE user_id = $1 ORDER BY evaluated_at DESC LIMIT 1;", payload.user_id)
            prof = (score_row["overall_proficiency"] if score_row else "Intermediate").capitalize()
            scores = {
                "reading": float(score_row["reading_score"]) if score_row else 65.0,
                "writing": float(score_row["writing_score"]) if score_row else 50.0,
                "comprehension": float(score_row["comprehension_score"]) if score_row else 70.0
            }
            prev_data = await _generate_chapter_ai(payload.user_id, preview_ch_num, t_lang, n_lang, prof, scores, db)
            diff_level = "Beginner" if preview_ch_num <= 3 else ("Intermediate" if preview_ch_num <= 7 else "Advanced")
            await db.execute("""
                INSERT INTO study_guide_chapters (user_id, chapter_number, title, summary, content_markdown, target_language, native_language, difficulty_level, is_unlocked, required_lessons_count, completed_lessons_count, test_passed)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, 2, 0, FALSE)
                ON CONFLICT (user_id, chapter_number) DO NOTHING;
            """, payload.user_id, preview_ch_num, prev_data["title"], prev_data["summary"], prev_data["content_markdown"], t_lang, n_lang, diff_level)

        msg = f"Congratulations! You scored {score_pct}% and unlocked Chapter {next_ch_num}!"
    else:
        msg = f"You scored {score_pct}%. You need at least 70% to unlock Chapter {next_ch_num}. Review Chapter {ch_num} and try again!"

    return SubmitUnlockTestResponse(
        test_id=test_row["test_id"],
        score_percentage=score_pct,
        passed=passed,
        unlocked_next_chapter=passed,
        next_chapter_number=next_ch_num if passed else None,
        message=msg
    )
