from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import asyncpg
import json
from app.db import get_db
from app.config import settings

router = APIRouter(prefix="/api/assessments", tags=["Assessments"])

# Request/Response schemas
class QuestionSchema(BaseModel):
    id: str
    question: str
    options: List[str]
    answer: str
    points: Optional[int] = 10

class AssessmentResponse(BaseModel):
    assessment_id: int
    assessment_type: str
    language_code: str
    passage_text: Optional[str] = None
    question_data: Optional[List[Dict[str, Any]]] = None

class UserAssessmentResponse(BaseModel):
    assessment_id: int
    answers: Dict[str, str]  # question_id -> user selected answer

class AssessmentSubmission(BaseModel):
    user_id: int
    responses: List[UserAssessmentResponse]

class SubmitResultResponse(BaseModel):
    score_id: int
    user_id: int
    reading_score: int
    writing_score: int
    comprehension_score: int
    overall_proficiency: str
    evaluated_at: datetime
    detailed_responses: Optional[List[Dict[str, Any]]] = None

class RegistrationQuizQuestion(BaseModel):
    id: str
    question: str
    options: List[str]
    answer: str
    section: str
    difficulty: str

class QuizResponseItem(BaseModel):
    id: str
    user_answer: str
    correct_answer: str
    difficulty: str

class RegistrationQuizSubmission(BaseModel):
    user_id: int
    responses: List[QuizResponseItem]



import urllib.request
import os
import random
import asyncio
from app.config import settings
from app.key_manager import key_manager, call_gemini_with_key_failover

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def get_api_keys() -> list:
    return key_manager.get_keys(for_module_gen=False)


@router.get("", response_model=List[AssessmentResponse])
async def get_assessments(
    target_lang: Optional[str] = Query(None, description="Target language to learn"),
    native_lang: Optional[str] = Query(None, description="Native language of user"),
    lang: Optional[str] = Query(None, description="Legacy language code"),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Fetches dynamic placement check diagnostic assessments.
    Calls Gemini API to generate custom questions and inserts them into assessments table, returning unique IDs.
    """
    t_lang = target_lang or lang or "en"
    n_lang = native_lang or "en"
    
    t_lang_code = t_lang.lower()
    n_lang_code = n_lang.lower()

    # Define a clean database fallback in case API fails
    async def get_db_fallback():
        rows = await db.fetch(
            """
            SELECT assessment_id, assessment_type, passage_text, question_data
            FROM assessments
            WHERE language_code = $1
            ORDER BY assessment_id;
            """,
            t_lang_code
        )
        if not rows:
            # If no rows exist for that language, pull the English ones as absolute default
            rows = await db.fetch(
                """
                SELECT assessment_id, assessment_type, passage_text, question_data
                FROM assessments
                WHERE language_code = 'en'
                ORDER BY assessment_id;
                """
            )
        return [
            AssessmentResponse(
                assessment_id=row["assessment_id"],
                assessment_type=row["assessment_type"],
                language_code=t_lang_code,
                passage_text=row["passage_text"] or "",
                question_data=json.loads(row["question_data"]) if isinstance(row["question_data"], str) else row["question_data"]
            )
            for row in rows
        ]

    # 1. Try to read from local file cache first to optimize API calls and save free tier limits
    cache_filename = f"assessments_{t_lang_code}_{n_lang_code}.json"
    cache_path = os.path.join(CACHE_DIR, cache_filename)
    generated_list = None
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                generated_list = json.load(f)
            print(f"[CACHE HIT] Loaded diagnostic assessments from file cache for {t_lang_code}-{n_lang_code}.")
        except Exception as e:
            print(f"[CACHE ERROR] Failed to read assessments cache: {e}")
            generated_list = None

    if not generated_list:
        prompt = f"""
        You are a warm, supportive, and encouraging personal language tutor.
        Generate a set of 3 placement diagnostic questions for a student learning the language '{t_lang_code}'.
        The instruction language of the student is '{n_lang_code}'.
        Write all instructions, questions, and passages in a friendly, encouraging, human-written tone. Avoid robotic or machine-like language.
        
        The set MUST contain exactly three objects in a JSON array:
        1. First object: A reading task (type: 'reading'). A short sentence (6-8 words) in '{t_lang_code}' for the student to read aloud.
        2. Second object: A comprehension task (type: 'comprehension'). A short story (3 sentences) in '{t_lang_code}' followed by an MCQ testing details. The questions and options must be in the instruction language '{n_lang_code}' or target language '{t_lang_code}' to check their understanding.
        3. Third object: A writing task (type: 'writing'). A simple writing prompt in '{n_lang_code}' or '{t_lang_code}'.

        Format the JSON response exactly as a JSON array of 3 objects:
        [
          {{
            "type": "reading",
            "passage": "Write the short sentence to be read aloud in '{t_lang_code}'",
            "questions": [
              {{
                "id": "q1",
                "question": "Read this sentence aloud:",
                "options": [],
                "answer": "Write the exact short sentence here"
              }}
            ]
          }},
          {{
            "type": "comprehension",
            "passage": "Write the 3-sentence short story context in '{t_lang_code}'",
            "questions": [
              {{
                "id": "q2",
                "question": "Ask a question about the story",
                "options": ["Choice 1", "Choice 2", "Choice 3", "Choice 4"],
                "answer": "The correct choice matching one of the options exactly"
              }}
            ]
          }},
          {{
            "type": "writing",
            "passage": "Write the writing prompt topic in '{t_lang_code}' or '{n_lang_code}'",
            "questions": [
              {{
                "id": "q3",
                "question": "Ask them to write a sentence about the topic",
                "options": [],
                "answer": "",
                "min_words": 5
              }}
            ]
          }}
        ]

        Only respond with raw JSON matching this schema. No markdown formatting.
        """
        try:
            res_text = await call_gemini_with_key_failover(prompt, for_module_gen=False, timeout=25)
            generated_list = json.loads(res_text)
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(generated_list, f, ensure_ascii=False, indent=2)
                print(f"[CACHE WRITE] Saved dynamic assessments to file cache for {t_lang_code}-{n_lang_code}.")
            except Exception as cache_err:
                print(f"[CACHE WRITE ERROR] Failed to write assessments cache: {cache_err}")
        except Exception as err:
            print(f"[API FAILOVER WARN] Assessment generation failed with failover: {err}")
            generated_list = None


        if not generated_list:
            print("[WARNING] All Gemini API keys failed. Returning database assessments fallback.")
            return await get_db_fallback()

    try:
        results = []
        for gen_item in generated_list:
            a_type = gen_item.get("type", "reading")
            passage = gen_item.get("passage", "")
            questions = gen_item.get("questions", [])
            
            # Insert dynamic row into assessments database to avoid concurrent user overwrites
            a_id = await db.fetchval(
                """
                INSERT INTO assessments (assessment_type, language_code, passage_text, question_data)
                VALUES ($1, $2, $3, $4)
                RETURNING assessment_id;
                """,
                a_type,
                t_lang_code,
                passage,
                json.dumps(questions)
            )
            
            results.append(
                AssessmentResponse(
                    assessment_id=a_id,
                    assessment_type=a_type,
                    language_code=t_lang_code,
                    passage_text=passage,
                    question_data=questions
                )
            )
        print(f"[INFO] Successfully prepared {len(results)} assessments for {t_lang_code}.")
        return results

    except Exception as e:
        print(f"Failed to generate dynamic assessments with Gemini: {e}. Returning database assessments fallback.")
        return await get_db_fallback()



def check_similarity(s1: str, s2: str) -> float:
    clean = lambda s: "".join(c.lower() for c in s if c.isalnum() or c.isspace()).strip()
    w1 = clean(s1).split()
    w2 = clean(s2).split()
    if not w1 or not w2:
        return 0.0
    matches = sum(1 for w in w1 if w in w2)
    return (matches / max(len(w1), len(w2))) * 100.0

@router.post("/submit", response_model=SubmitResultResponse)
async def submit_assessment(
    submission: AssessmentSubmission,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Submits user answers to the diagnostic, scores each category, 
    persists results to the learner_scores table, and returns proficiency level.
    """
    submitted_ids = [resp.assessment_id for resp in submission.responses]
    
    if not submitted_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No assessment responses submitted."
        )
        
    # Fetch original assessments from DB to check correct answers
    rows = await db.fetch(
        """
        SELECT assessment_id, assessment_type, question_data
        FROM assessments
        WHERE assessment_id = ANY($1::int[]);
        """,
        submitted_ids
    )
    
    assessments_map = {row["assessment_id"]: row for row in rows}
    
    # Grading counts
    reading_total, reading_correct = 0, 0
    writing_total, writing_correct = 0, 0
    comprehension_total, comprehension_correct = 0, 0
    
    # Track the responses details for persistence
    detailed_responses_log = []
    
    for resp in submission.responses:
        a_id = resp.assessment_id
        db_assessment = assessments_map.get(a_id)
        if not db_assessment:
            continue
            
        a_type = db_assessment["assessment_type"].lower()
        q_data_raw = db_assessment["question_data"]
        
        # Parse DB questions
        questions = []
        if q_data_raw:
            if isinstance(q_data_raw, str):
                try:
                    questions = json.loads(q_data_raw)
                except ValueError:
                    pass
            else:
                questions = q_data_raw
                
        user_answers = resp.answers
        graded_questions = []
        
        for q in questions:
            q_id = str(q.get("id") or "")
            correct_ans = str(q.get("answer") or q.get("correct_answer") or q.get("correct_option") or "").strip()
            user_ans = str(user_answers.get(q_id) or "").strip()
            
            is_correct = False
            if correct_ans:
                if "reading" in a_type:
                    # Fuzzy match for spoken reading checks (at least 60% similarity)
                    sim = check_similarity(user_ans, correct_ans)
                    if sim >= 60.0:
                        is_correct = True
                else:
                    if user_ans.lower() == correct_ans.lower():
                        is_correct = True
            else:
                # Support writing/free-text questions
                min_words = q.get("min_words")
                if min_words is not None:
                    words = [w for w in user_ans.split() if w.strip()]
                    if len(words) >= int(min_words):
                        is_correct = True
                else:
                    if len(user_ans.strip()) > 0:
                        is_correct = True

                
            graded_questions.append({
                "question_id": q_id,
                "question_text": q.get("question") or "",
                "user_answer": user_ans,
                "correct_answer": correct_ans,
                "is_correct": is_correct
            })
            
            # Increment tallies
            if "reading" in a_type:
                reading_total += 1
                if is_correct:
                    reading_correct += 1
            elif "writing" in a_type:
                writing_total += 1
                if is_correct:
                    writing_correct += 1
            elif "comprehension" in a_type or "comp" in a_type:
                comprehension_total += 1
                if is_correct:
                    comprehension_correct += 1
            else:
                # Default category is reading
                reading_total += 1
                if is_correct:
                    reading_correct += 1
                    
        detailed_responses_log.append({
            "assessment_id": a_id,
            "assessment_type": a_type,
            "graded_questions": graded_questions
        })
        
    # Calculate scores (0 to 100)
    reading_score = int((reading_correct / reading_total) * 100) if reading_total > 0 else 0
    writing_score = int((writing_correct / writing_total) * 100) if writing_total > 0 else 0
    comprehension_score = int((comprehension_correct / comprehension_total) * 100) if comprehension_total > 0 else 0
    
    # Calculate overall score based on the categories that had questions
    active_scores = []
    if reading_total > 0:
        active_scores.append(reading_score)
    if writing_total > 0:
        active_scores.append(writing_score)
    if comprehension_total > 0:
        active_scores.append(comprehension_score)
        
    overall_score = int(sum(active_scores) / len(active_scores)) if active_scores else 0
    
    # Map overall score to proficiency benchmark
    if overall_score <= 40:
        overall_proficiency = "Beginner"
    elif overall_score <= 70:
        overall_proficiency = "Intermediate"
    else:
        overall_proficiency = "Advanced"
        
    # Persist the score record to database
    detailed_responses_json = json.dumps(detailed_responses_log)
    
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    # Insert score record. 
    # If the column detailed_responses is defined as JSON/JSONB, asyncpg can accept 
    # the dict directly or we can pass the stringified JSON. 
    # Let's pass the stringified JSON or let asyncpg handle it.
    try:
        score_row = await db.fetchrow(
            """
            INSERT INTO learner_scores (user_id, reading_score, writing_score, comprehension_score, overall_proficiency, evaluated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING score_id, user_id, reading_score, writing_score, comprehension_score, overall_proficiency, evaluated_at;
            """,
            submission.user_id,
            reading_score,
            writing_score,
            comprehension_score,
            overall_proficiency,
            now
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database write error: {str(err)}"
        )
            
    return SubmitResultResponse(
        score_id=score_row["score_id"],
        user_id=score_row["user_id"],
        reading_score=score_row["reading_score"],
        writing_score=score_row["writing_score"],
        comprehension_score=score_row["comprehension_score"],
        overall_proficiency=score_row["overall_proficiency"],
        evaluated_at=score_row["evaluated_at"],
        detailed_responses=None
    )


def get_fallback_registration_quiz(target_lang: str, native_lang: str) -> List[Dict[str, Any]]:
    target = target_lang.lower()
    if target == 'hi':
        questions = [

            {"id": "reg_q1", "question": "Which letter comes after 'क' in Hindi?", "options": ["ख", "ग", "घ", "च"], "answer": "ख", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q2", "question": "What is the meaning of 'आम'?", "options": ["Apple", "Mango", "Banana", "Orange"], "answer": "Mango", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q3", "question": "Identify the word that means 'Water':", "options": ["जल", "आग", "हवा", "मिट्टी"], "answer": "जल", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q4", "question": "Match the emoji: 🍎", "options": ["सेब", "केला", "संतरा", "अंगूर"], "answer": "सेब", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q5", "question": "Choose the correct verb: 'लड़का दौड़ रहा ____।'", "options": ["है", "हैं", "था", "हूँ"], "answer": "है", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q6", "question": "What is the opposite of 'गर्म' (hot)?", "options": ["ठंडा", "सफेद", "बड़ा", "नया"], "answer": "ठंडा", "section": "Vocabulary", "difficulty": "Intermediate"},
            {"id": "reg_q7", "question": "Translate: 'I read a book.'", "options": ["मैं किताब पढ़ता हूँ।", "मैं सोता हूँ।", "मैं घर जाता हूँ।", "मैं खाना खाता हूँ।"], "answer": "मैं किताब पढ़ता हूँ।", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q8", "question": "Read and answer: 'एक छोटा कौआ प्यासा था। उसने घड़े में कंकड़ डाले। पानी ऊपर आ गया।'", "options": ["कौआ भूखा था", "कौआ प्यासा था", "कौआ थका था", "कौआ खुश था"], "answer": "कौआ प्यासा था", "section": "Comprehension", "difficulty": "Advanced"},
            {"id": "reg_q9", "question": "Select the correct formal request:", "options": ["कृपया मेरी मदद करें।", "तू मदद कर मेरी।", "मदद कर भाई।", "मदद कर देना बे।"], "answer": "कृपया मेरी मदद करें।", "section": "Grammar", "difficulty": "Advanced"},
            {"id": "reg_q10", "question": "Translate: 'He is a hard-working farmer.'", "options": ["वह एक मेहनती किसान है।", "वह एक आलसी किसान है।", "वह शहर जा रहा है।", "वह सो रहा है।"], "answer": "वह एक मेहनती किसान है।", "section": "Grammar", "difficulty": "Advanced"}
        ]
    elif target == 'kn':
        questions = [
            {"id": "reg_q1", "question": "Which letter comes after 'ಅ' in Kannada?", "options": ["ಆ", "ಇ", "ಉ", "ಋ"], "answer": "ಆ", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q2", "question": "What is the meaning of 'ಹಣ್ಣು'?", "options": ["Flower", "Fruit", "Leaf", "Tree"], "answer": "Fruit", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q3", "question": "Identify the word that means 'House':", "options": ["ಮನೆ", "ಕಾಡು", "ಕೆರೆ", "ಬೆಟ್ಟ"], "answer": "ಮನೆ", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q4", "question": "Match the emoji: 🏠", "options": ["ಮನೆ", "ಶಾಲೆ", "ಬಂಡಿ", "ಗಿಡ"], "answer": "ಮನೆ", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q5", "question": "Choose the correct verb: 'ರಾಜು ಶಾಲೆಗೆ ____।'", "options": ["ಹೋಗುತ್ತಾನೆ", "ಹೋಗುತ್ತಾರೆ", "ಹೋಗು", "ಹೋಗುತ್ತಾಳೆ"], "answer": "ಹೋಗುತ್ತಾನೆ", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q6", "question": "What is the opposite of 'ಬಿಸಿ' (hot)?", "options": ["ತಂಪು", "ದೊಡ್ಡದು", "ಹೊಸತು", "ಬಿಳಿ"], "answer": "ತಂಪು", "section": "Vocabulary", "difficulty": "Intermediate"},
            {"id": "reg_q7", "question": "Translate: 'I read a book.'", "options": ["ನಾನು ಪುಸ್ತಕ ಓದುತ್ತೇನೆ।", "ನಾನು ಮಲಗುತ್ತೇನೆ।", "ನಾನು ಮನೆಗೆ ಹೋಗುತ್ತೇನೆ।", "ನಾನು ಊಟ ಮಾಡುತ್ತೇನೆ।"], "answer": "ನಾನು ಪುಸ್ತಕ ಓದುತ್ತೇನೆ।", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q8", "question": "Read and answer: 'ಒಂದು ಬಾಯಾರಿದ ಕಾಗೆ ಇತ್ತು. ಹೂಜಿಯಲ್ಲಿ ಸ್ವಲ್ಪ ನೀರಿತ್ತು. ಕಾಗೆ ಕಲ್ಲುಗಳನ್ನು ಹಾಕಿತು.'", "options": ["ಕಾಗೆಗೆ ಹಸಿವಾಗಿತ್ತು", "ಕಾಗೆಗೆ ಬಾಯಾರಿಕೆಯಾಗಿತ್ತು", "ಕಾಗೆ ತೀರಿಕೊಂಡಿತು", "ಕಾಗೆ ಹಾರಿ ಹೋಯಿತು"], "answer": "ಕಾಗೆಗೆ ಬಾಯಾರಿಕೆಯಾಗಿತ್ತು", "section": "Comprehension", "difficulty": "Advanced"},
            {"id": "reg_q9", "question": "Select the correct formal request:", "options": ["ದಯವಿಟ್ಟು ನನಗೆ ಸಹಾಯ ಮಾಡಿ।", "ಸಹಾಯ ಮಾಡು ನನಗೆ।", "ಸಹಾಯ ಮಾಡು ಮಗನೇ।", "ಸಹಾಯ ಮಾಡಪ್ಪ।"], "answer": "ದಯವಿಟ್ಟು ನನಗೆ ಸಹಾಯ ಮಾಡಿ।", "section": "Grammar", "difficulty": "Advanced"},
            {"id": "reg_q10", "question": "Translate: 'He is a farmer.'", "options": ["ಅವನು ರೈತನು।", "ಅವನು ವೈದ್ಯನು।", "ಅವನು ಶಿಕ್ಷಕನು।", "ಅವನು ಚಾಲಕನು।"], "answer": "ಅವನು ರೈತನು।", "section": "Grammar", "difficulty": "Advanced"}
        ]
    elif target == 'es':
        questions = [
            {"id": "reg_q1", "question": "What is the English translation of 'Hola'?", "options": ["Hello", "Goodbye", "Please", "Thank you"], "answer": "Hello", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q2", "question": "Which word means 'Water' in Spanish?", "options": ["Agua", "Fuego", "Tierra", "Aire"], "answer": "Agua", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q3", "question": "Identify the Spanish word for 'Book':", "options": ["Libro", "Mesa", "Silla", "Casa"], "answer": "Libro", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q4", "question": "Match the emoji: 🍎", "options": ["Manzana", "Plátano", "Naranja", "Uva"], "answer": "Manzana", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q5", "question": "Choose the correct verb form: 'El perro _____ mucho.'", "options": ["corre", "corren", "corro", "correr"], "answer": "corre", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q6", "question": "What is the opposite of 'caliente' (hot)?", "options": ["frío", "blanco", "grande", "nuevo"], "answer": "frío", "section": "Vocabulary", "difficulty": "Intermediate"},
            {"id": "reg_q7", "question": "Translate: 'I read a book.'", "options": ["Leo un libro.", "Duermo en casa.", "Voy a la escuela.", "Como manzanas."], "answer": "Leo un libro.", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q8", "question": "Read: 'Un pájaro rojo canta en el árbol verde.' Question: What color is the bird?", "options": ["Red (Rojo)", "Green (Verde)", "Blue (Azul)", "Yellow (Amarillo)"], "answer": "Red (Rojo)", "section": "Comprehension", "difficulty": "Advanced"},
            {"id": "reg_q9", "question": "Select the correct polite expression:", "options": ["Por favor", "De nada", "Lo siento", "Gracias"], "answer": "Por favor", "section": "Grammar", "difficulty": "Advanced"},
            {"id": "reg_q10", "question": "Translate: 'He is a student.'", "options": ["Él es estudiante.", "Él es médico.", "Él es maestro.", "Él es cocinero."], "answer": "Él es estudiante.", "section": "Grammar", "difficulty": "Advanced"}
        ]
    elif target == 'fr':
        questions = [
            {"id": "reg_q1", "question": "What is the English translation of 'Bonjour'?", "options": ["Hello / Good day", "Goodbye", "Night", "Welcome"], "answer": "Hello / Good day", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q2", "question": "Which word means 'Water' in French?", "options": ["Eau", "Feu", "Terre", "Air"], "answer": "Eau", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q3", "question": "Identify the French word for 'Cat':", "options": ["Chat", "Chien", "Oiseau", "Poisson"], "answer": "Chat", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q4", "question": "Match the emoji: 🍎", "options": ["Pomme", "Banane", "Orange", "Raisin"], "answer": "Pomme", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q5", "question": "Choose the correct verb form: 'Je _____ à la maison.'", "options": ["suis", "es", "est", "sommes"], "answer": "suis", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q6", "question": "What is the opposite of 'chaud' (hot)?", "options": ["froid", "grand", "petit", "nouveau"], "answer": "froid", "section": "Vocabulary", "difficulty": "Intermediate"},
            {"id": "reg_q7", "question": "Translate: 'I read a book.'", "options": ["Je lis un livre.", "Je dors bien.", "Je mange un fruit.", "Je parle français."], "answer": "Je lis un livre.", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q8", "question": "Read: 'Un petit chat noir dort sur la chaise.' Question: What animal is sleeping?", "options": ["Cat (Chat)", "Dog (Chien)", "Bird (Oiseau)", "Fish (Poisson)"], "answer": "Cat (Chat)", "section": "Comprehension", "difficulty": "Advanced"},
            {"id": "reg_q9", "question": "Select the correct polite expression:", "options": ["S'il vous plaît", "Merci", "Pardon", "Au revoir"], "answer": "S'il vous plaît", "section": "Grammar", "difficulty": "Advanced"},
            {"id": "reg_q10", "question": "Translate: 'She is a doctor.'", "options": ["Elle est médecin.", "Elle est étudiante.", "Elle est professeur.", "Elle est artiste."], "answer": "Elle est médecin.", "section": "Grammar", "difficulty": "Advanced"}
        ]
    else:
        # Dynamic placement question template for any target_lang (e.g. English or other languages)
        lang_name = target_lang.upper()
        questions = [
            {"id": "reg_q1", "question": f"Which basic greeting is commonly used in {lang_name}?", "options": [f"Hello in {lang_name}", "Option B", "Option C", "Option D"], "answer": f"Hello in {lang_name}", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q2", "question": f"Select the correct word for 'Water' in {lang_name}:", "options": [f"Water in {lang_name}", "Fire", "Earth", "Air"], "answer": f"Water in {lang_name}", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q3", "question": f"Choose the foundational alphabet or basic word in {lang_name}:", "options": [f"Basic Word 1 ({lang_name})", "Word 2", "Word 3", "Word 4"], "answer": f"Basic Word 1 ({lang_name})", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q4", "question": f"Match the object emoji 🍎 with its {lang_name} name:", "options": [f"Apple in {lang_name}", "Banana", "Orange", "Grape"], "answer": f"Apple in {lang_name}", "section": "Vocabulary", "difficulty": "Beginner"},
            {"id": "reg_q5", "question": f"Choose the correct present tense verb structure in {lang_name}:", "options": [f"Correct Verb ({lang_name})", "Incorrect Verb B", "Incorrect Verb C", "Incorrect Verb D"], "answer": f"Correct Verb ({lang_name})", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q6", "question": f"Identify the antonym (opposite) of 'Hot' in {lang_name}:", "options": [f"Cold in {lang_name}", "Warm", "Hot", "Fire"], "answer": f"Cold in {lang_name}", "section": "Vocabulary", "difficulty": "Intermediate"},
            {"id": "reg_q7", "question": f"Translate: 'I read a book' into {lang_name}:", "options": [f"I read a book in {lang_name}", "I am sleeping", "I eat food", "I walk home"], "answer": f"I read a book in {lang_name}", "section": "Grammar", "difficulty": "Intermediate"},
            {"id": "reg_q8", "question": f"Read the passage: 'A student learns {lang_name} daily with focus and joy.' Question: What is the student learning?", "options": [f"{lang_name} language", "Mathematics", "Cooking", "Sports"], "answer": f"{lang_name} language", "section": "Comprehension", "difficulty": "Advanced"},
            {"id": "reg_q9", "question": f"Select the formal expression for 'Please' in {lang_name}:", "options": [f"Please in {lang_name}", "Thanks", "Sorry", "Bye"], "answer": f"Please in {lang_name}", "section": "Grammar", "difficulty": "Advanced"},
            {"id": "reg_q10", "question": f"Choose the grammatically complete sentence in {lang_name}:", "options": [f"Grammatical Sentence ({lang_name})", "Incomplete B", "Incomplete C", "Incomplete D"], "answer": f"Grammatical Sentence ({lang_name})", "section": "Grammar", "difficulty": "Advanced"}
        ]
    return questions


@router.get("/registration-quiz", response_model=List[RegistrationQuizQuestion])
async def get_registration_quiz(
    target_lang: str = Query("en", description="Target language to learn"),
    native_lang: str = Query("en", description="User native instruction language"),
    edu_level: Optional[str] = Query(None, description="User completed school/education level"),
    seed: Optional[str] = Query(None, description="Unique seed identifier for distinct user question set")
):
    """
    Generates 10 unique onboarding questions using Gemini AI API for placement diagnostic.
    Every user gets a brand new, unique set of 10 questions.
    """
    t_lang_code = target_lang.lower()
    n_lang_code = native_lang.lower()
    e_level = (edu_level or "primary").lower()
    seed_val = seed or f"{random.randint(100000, 999999)}"

    # If no seed is passed, check local file cache
    cache_path = os.path.join(CACHE_DIR, f"registration_quiz_{t_lang_code}_{n_lang_code}_{e_level}.json")
    generated_list = None
    if not seed and os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                generated_list = json.load(f)
            print(f"[CACHE HIT] Loaded registration quiz from file cache for {t_lang_code}-{n_lang_code}-{e_level}.")
        except Exception as e:
            print(f"[CACHE ERROR] Failed to read registration quiz cache: {e}")
            generated_list = None

    if not generated_list:
        prompt = f"""
        You are a warm, friendly, and encouraging language mentor.
        Generate a completely unique and original placement diagnostic test of EXACTLY 10 multiple-choice questions for a student whose native language is '{native_lang}' and who wants to learn the TARGET LANGUAGE '{target_lang}'.
        The random seed identifier is #{seed_val}.
        
        CRITICAL MANDATE: ALL 10 QUESTIONS MUST STRICTLY EVALUATE THE STUDENT'S PROFICIENCY IN THE TARGET LANGUAGE '{target_lang}'.
        - Do NOT ask questions testing native language '{native_lang}' rules or grammar. 
        - The questions, choices, and reading passages MUST test words, alphabets, vocabulary, sentence structures, and comprehension of '{target_lang}'.
        - Use native language '{native_lang}' only for writing friendly question instructions (e.g., "Select the correct translation of this {target_lang} word:" or "What is the meaning of this {target_lang} phrase?").

        The student's completed education level is '{edu_level or 'primary'}'. Tailor difficulty accordingly:
        - Questions 1 to 4 (Beginner difficulty): Basic vocabulary, target language '{target_lang}' alphabets, common words, and letter/word matching.
        - Questions 5 to 7 (Intermediate difficulty): Target language '{target_lang}' grammar, verb tenses, word order, and translating short phrases.
        - Questions 8 to 10 (Advanced difficulty): Target language '{target_lang}' reading comprehension (a 2-3 sentence passage in '{target_lang}' followed by a question in '{native_lang}' testing comprehension).

        Each question must be an object with the following fields:
        - "id": "reg_q1" through "reg_q10"
        - "question": "Question text in '{native_lang}' testing '{target_lang}' knowledge"
        - "options": An array of exactly 4 choices (in '{target_lang}' or translations)
        - "answer": "The correct option matching one of the options exactly"
        - "section": "Reading", "Vocabulary", "Grammar", or "Comprehension"
        - "difficulty": "Beginner", "Intermediate", or "Advanced"

        Format the JSON response exactly as a JSON array of 10 objects. Do not wrap in markdown code blocks, return raw JSON.
        """
        try:
            res_text = await call_gemini_with_key_failover(prompt, for_registration_quiz=True, timeout=25)
            generated_list = json.loads(res_text)
            if len(generated_list) != 10:
                print(f"[WARN] Gemini returned {len(generated_list)} questions instead of 10. Adjusting length...")
                if len(generated_list) > 10:
                    generated_list = generated_list[:10]
            if not seed and len(generated_list) == 10:
                try:
                    with open(cache_path, "w", encoding="utf-8") as f:
                        json.dump(generated_list, f, ensure_ascii=False, indent=2)
                    print(f"[CACHE WRITE] Saved registration quiz to file cache for {t_lang_code}-{n_lang_code}-{e_level}.")
                except Exception as cache_err:
                    print(f"[CACHE WRITE ERROR] Failed to write registration quiz cache: {cache_err}")
        except Exception as err:
            print(f"[API FAILOVER WARN] Registration quiz generation failed with failover: {err}")
            generated_list = None

    if not generated_list or len(generated_list) < 10:
        print("[WARNING] All Gemini API keys failed for registration quiz. Returning fallback registration quiz.")
        return [RegistrationQuizQuestion(**q) for q in get_fallback_registration_quiz(target_lang, native_lang)[:10]]

    return [RegistrationQuizQuestion(**q) for q in generated_list]



@router.post("/submit-registration-quiz", response_model=SubmitResultResponse)
async def submit_registration_quiz(
    submission: RegistrationQuizSubmission,
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Submits registration quiz responses, grades them, and returns overall proficiency level.
    """
    beginner_total, beginner_correct = 0, 0
    intermediate_total, intermediate_correct = 0, 0
    advanced_total, advanced_correct = 0, 0

    detailed_responses_log = []

    for resp in submission.responses:
        is_correct = resp.user_answer.strip().lower() == resp.correct_answer.strip().lower()
        diff = resp.difficulty.capitalize()

        if diff == "Beginner":
            beginner_total += 1
            if is_correct:
                beginner_correct += 1
        elif diff == "Intermediate":
            intermediate_total += 1
            if is_correct:
                intermediate_correct += 1
        elif diff == "Advanced":
            advanced_total += 1
            if is_correct:
                advanced_correct += 1
        else:
            beginner_total += 1
            if is_correct:
                beginner_correct += 1

        detailed_responses_log.append({
            "question_id": resp.id,
            "user_answer": resp.user_answer,
            "correct_answer": resp.correct_answer,
            "is_correct": is_correct,
            "difficulty": resp.difficulty
        })

    # Scores out of 100
    reading_score = int((beginner_correct / beginner_total) * 100) if beginner_total > 0 else 0
    writing_score = int((intermediate_correct / intermediate_total) * 100) if intermediate_total > 0 else 0
    comprehension_score = int((advanced_correct / advanced_total) * 100) if advanced_total > 0 else 0

    total_correct = beginner_correct + intermediate_correct + advanced_correct

    # Score calculation out of 10 questions to assign initial learning track
    if total_correct >= 8:
        overall_proficiency = "Advanced"
    elif total_correct >= 5:
        overall_proficiency = "Intermediate"
    else:
        overall_proficiency = "Beginner"


    now = datetime.now(timezone.utc).replace(tzinfo=None)

    try:
        score_row = await db.fetchrow(
            """
            INSERT INTO learner_scores (user_id, reading_score, writing_score, comprehension_score, overall_proficiency, evaluated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING score_id, user_id, reading_score, writing_score, comprehension_score, overall_proficiency, evaluated_at;
            """,
            submission.user_id,
            reading_score,
            writing_score,
            comprehension_score,
            overall_proficiency,
            now
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database write error: {str(err)}"
        )

    return SubmitResultResponse(
        score_id=score_row["score_id"],
        user_id=score_row["user_id"],
        reading_score=score_row["reading_score"],
        writing_score=score_row["writing_score"],
        comprehension_score=score_row["comprehension_score"],
        overall_proficiency=score_row["overall_proficiency"],
        evaluated_at=score_row["evaluated_at"],
        detailed_responses=None
    )

