from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import asyncpg
import json
import os
import urllib.request
from app.db import get_db
from app.config import settings
from app.key_manager import key_manager, call_gemini_with_key_failover

# Setup file-based caching for Gemini API calls to optimize API usage
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)


def get_api_keys() -> List[str]:
    return key_manager.get_keys(for_module_gen=False)

def get_module_gen_api_keys() -> List[str]:
    return key_manager.get_keys(for_module_gen=True)


router = APIRouter(prefix="/api/curriculum", tags=["Curriculum Roadmap"])



class LessonResponse(BaseModel):
    lesson_id: int
    title_key: str
    translated_title: Optional[str] = None
    body_text: Optional[str] = None
    exercise_data: Optional[Any] = None

class CurriculumResponse(BaseModel):
    curriculum_id: int
    difficulty_level: str
    category: str
    sequence_order: int
    lessons: List[LessonResponse] = []

def _parse_flexible_json_array(raw: str) -> List[Dict[str, Any]]:
    clean_json = raw.strip()
    if "```json" in clean_json:
        clean_json = clean_json.split("```json")[1].split("```")[0].strip()
    elif "```" in clean_json:
        clean_json = clean_json.split("```")[1].split("```")[0].strip()

    # Try direct parse
    try:
        parsed = json.loads(clean_json)
        if isinstance(parsed, list) and len(parsed) > 0:
            return parsed
        if isinstance(parsed, dict):
            for k in ["modules", "lessons", "data", "items", "results"]:
                if k in parsed and isinstance(parsed[k], list) and len(parsed[k]) > 0:
                    return parsed[k]
    except Exception:
        pass

    # Try extracting array brackets
    start_idx = clean_json.find('[')
    end_idx = clean_json.rfind(']')
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        try:
            parsed = json.loads(clean_json[start_idx:end_idx+1])
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
        except Exception:
            pass

    # Try extracting dict braces
    start_idx = clean_json.find('{')
    end_idx = clean_json.rfind('}')
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        try:
            parsed = json.loads(clean_json[start_idx:end_idx+1])
            if isinstance(parsed, dict):
                for k in ["modules", "lessons", "data", "items", "results"]:
                    if k in parsed and isinstance(parsed[k], list) and len(parsed[k]) > 0:
                        return parsed[k]
        except Exception:
            pass

    raise ValueError(f"Could not parse valid array from JSON response (length {len(clean_json)})")


async def generate_curriculum_outline(target_lang: str, native_lang: str, db: asyncpg.Connection, user_id: Optional[int] = None):
    """
    Calls Gemini (prioritizing MODULE_GEN_KEY) to generate a personalized curriculum outline
    (3 levels, 11 total modules, 10 lessons each) tailored to the learner's profile & diagnostic scores,
    and inserts it into the database with empty lesson details.
    """
    # Fetch learner profile & scores for AI personalization if user_id is provided
    user_context = ""
    if user_id:
        u_row = await db.fetchrow("SELECT name, age, education_level FROM users WHERE user_id = $1;", user_id)
        s_row = await db.fetchrow(
            "SELECT reading_score, writing_score, comprehension_score, overall_proficiency FROM learner_scores WHERE user_id = $1 ORDER BY evaluated_at DESC LIMIT 1;",
            user_id
        )
        if u_row or s_row:
            u_name = u_row["name"] if u_row and u_row.get("name") else f"Learner #{user_id}"
            u_level = s_row["overall_proficiency"] if s_row and s_row.get("overall_proficiency") else "Beginner"
            r_s = float(s_row["reading_score"]) if s_row else 50.0
            w_s = float(s_row["writing_score"]) if s_row else 50.0
            c_s = float(s_row["comprehension_score"]) if s_row else 50.0
            weak_skill = "Writing" if w_s <= r_s and w_s <= c_s else ("Reading" if r_s <= c_s else "Comprehension")
            user_context = (
                f"This curriculum roadmap is personalized specifically for learner '{u_name}' "
                f"(Assigned Level: '{u_level}', Baseline Scores: Reading {r_s:.0f}%, Writing {w_s:.0f}%, Comprehension {c_s:.0f}%). "
                f"Emphasize extra practice and progressive module topics tailored to improve their weak skill area: '{weak_skill}'."
            )

    # 1. Try to read from local file cache first to optimize API calls
    cache_filename = f"outline_{target_lang}_{native_lang}_u{user_id or 0}.json"
    cache_path = os.path.join(CACHE_DIR, cache_filename)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                outline = json.load(f)
            print(f"[CACHE HIT] Loaded curriculum outline from file cache for {target_lang}-{native_lang} (User: {user_id}).")
        except Exception as e:
            print(f"[CACHE ERROR] Failed to read curriculum outline cache: {e}")
            outline = None
    else:
        outline = None

    if not outline:
        prompt = f"""
        Generate a personalized curriculum roadmap outline for teaching the language '{target_lang}' to a speaker of '{native_lang}'.
        {user_context}
        The roadmap must contain exactly three difficulty levels: 'Beginner', 'Intermediate', and 'Advanced'.
        
        The modules must be structured as follows:
        1. 'Beginner' level must contain exactly 5 modules (sequence_order 1 to 5) covering the absolute basics:
           - Module 1: Alphabets & Sounds (learning the characters, letters, and phonics of the language)
           - Module 2: Basic Words & Greetings (everyday vocabulary, simple greetings)
           - Module 3: Simple Grammar & Nouns (subject pronouns, basic plural structures)
           - Module 4: Common Phrases & Verbs (everyday action words, polite expressions)
           - Module 5: Simple Sentences & Conversations (short dialogs, daily routine statements)
        2. 'Intermediate' level must contain exactly 3 modules (sequence_order 6 to 8) focusing on vocabulary building, paragraph reading, and structural grammar.
        3. 'Advanced' level must contain exactly 3 modules (sequence_order 9 to 11) focusing on essay writing, advanced communication skills, and reading comprehension.
        
        For each module (category), list exactly 10 lesson title keys.

        Format the JSON response exactly as a JSON array of 11 module objects:
        [
          {{
            "difficulty_level": "Beginner" | "Intermediate" | "Advanced",
            "category": "Name of the Module/Category translated into '{native_lang}' (e.g. 'Alphabets & Phonetics' if native_lang is English)",
            "sequence_order": 1 to 11,
            "lessons": [
              {{
                "title_key": "lesson_unique_key_1",
                "translated_title": "Lesson Title translated into '{native_lang}' (e.g. 'Daily Greetings & Expressions')"
              }},
              ...
              (exactly 10 lessons)
            ]
          }},

          ...
        ]

        Make sure there are exactly 11 modules in total (5 Beginner + 3 Intermediate + 3 Advanced) and exactly 10 lessons per module. Return only the raw JSON.
        """

        try:
            res_text = await call_gemini_with_key_failover(
                prompt,
                for_module_gen=True,
                timeout=25,
                validator_fn=_parse_flexible_json_array
            )
            outline = _parse_flexible_json_array(res_text)
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(outline, f, ensure_ascii=False, indent=2)
                print(f"[CACHE WRITE] Saved personalized outline to file cache for {target_lang}-{native_lang} (User: {user_id}).")
            except Exception as cache_err:
                print(f"[CACHE WRITE ERROR] Failed to write outline cache: {cache_err}")
        except Exception as err:
            print(f"[AI GENERATION ERROR] Outline generation failed after trying all models: {err}")
            outline = None

    if not outline:
        # Curated, pedagogical fallback curriculum outline with natural lesson titles
        curated_module_lessons = {
            1: ["Introduction to Vowels and Sounds", "Consonants and Basic Phonics", "Short Vowel Patterns (A, E, I, O, U)", "Consonant Blends (BL, CL, TR, ST)", "Silent Letters and Pronunciation Rules", "Digraphs (CH, SH, TH, WH)", "Long Vowels and Magic E", "Double Vowel Sounds (EE, OO, EA)", "Word Stress and Syllables", "Phonics Review and Pronunciation Mastery"],
            2: ["Morning & Evening Daily Greetings", "Saying Please, Thank You & Politeness", "Numbers 1 to 20 & Simple Counting", "Colors and Visual Descriptions", "Common Household Objects", "Days of the Week & Daily Calendar", "Talking About Family Members", "Asking Simple Names & Introductions", "Everyday Food and Beverages", "Greetings & Vocabulary Mastery"],
            3: ["Subject Pronouns (I, You, He, She, We)", "Singular and Plural Nouns", "The Verb 'To Be' (Am, Is, Are)", "Articles (A, An, The)", "Basic Action Verbs in Present Tense", "Possessive Adjectives (My, Your, His, Her)", "Simple Adjectives (Big, Small, Good, New)", "Using This, That, These, Those", "Forming Simple Questions (Who, What)", "Grammar & Sentence Foundation Review"],
            4: ["Action Words in Daily Routine", "Expressing Likes, Dislikes & Preferences", "Asking For Help and Directions", "Shopping Phrases and Prices", "Telling Time and Schedules", "Ordering Food at a Restaurant", "Talking About the Weather", "Transportation and Travel Phrases", "Making Friendly Requests", "Everyday Conversational Expressions Review"],
            5: ["Introducing Yourself to a New Friend", "Describing Your Daily Routine", "Asking About Hobbies and Free Time", "Visiting the Doctor and Explaining Health", "Making Weekend Plans with Friends", "Talking About Your Hometown and City", "Making a Telephone or Video Call", "Writing a Short Friendly Note", "Handling Small Problems Politely", "Beginner Conversational Fluency Milestone"],
            6: ["Expanding Conversational Vocabulary", "Past Tense: Regular Verbs (-ed)", "Past Tense: Common Irregular Verbs", "Future Plans with 'Going To' and 'Will'", "Connecting Sentences (And, But, Because, So)", "Expressing Opinions and Agreement", "Describing People, Clothes and Personality", "Workplace and Career Vocabulary", "Narrating a Memorable Story", "Intermediate Vocabulary Mastery"],
            7: ["Modal Verbs (Can, Could, Should, Must)", "Expressing Possibility (May, Might)", "Comparing Things (Comparative & Superlative)", "Giving Advice and Recommendations", "Making Polite Suggestions", "Expressing Conditions with 'If'", "Phrasal Verbs in Daily Conversations", "Using Adverbs of Frequency", "Expressing Emotions and Reactions", "Verbs and Structural Mastery"],
            8: ["Present Perfect Tense Basics", "Since vs. For in Time Expressions", "Using 'Already', 'Yet', and 'Just'", "Passive Voice in Simple Sentences", "Relative Clauses (Who, Which, That)", "Reported Speech in Daily Talk", "Formal vs. Informal Language Styles", "Expressing Cause and Effect", "Debating Points of View", "Grammar & Complex Structure Milestone"],
            9: ["Academic and Professional Vocabulary", "Idioms and Cultural Expressions", "Formal Email and Letter Composition", "Nuanced Adjectives for Abstract Concepts", "Expressing Uncertainty and Hypotheses", "Second and Third Conditionals", "Advanced Phrasal Verbs & Collocations", "Understanding Nuance and Tone", "Critical Thinking in Dialogue", "Advanced Vocabulary Mastery"],
            10: ["Reading Short Articles and Essays", "Summarizing Main Ideas in Writing", "Writing an Opinion Paragraph", "Structuring an Argumentative Response", "Analyzing Tone and Perspective", "Writing Formal Requests & Inquiries", "Proofreading and Self-Correction Skills", "Writing Detailed Descriptions of Events", "Creative Writing and Story Crafting", "Reading and Writing Task Proficiency"],
            11: ["Participating in Extended Discussions", "Giving a Structured Presentation", "Handling Unexpected Interview Questions", "Expressing Complex Arguments with Nuance", "Understanding Native Idiomatic Speech", "Humor, Sarcasm and Figurative Speech", "Persuasive Speaking Techniques", "Professional Meeting Communication", "Fluency, Confidence and Flow", "Advanced Language Mastery Graduation"]
        }

        modules_data = [
            ("Beginner", "Alphabets & Sounds", 1),
            ("Beginner", "Basic Words & Greetings", 2),
            ("Beginner", "Simple Grammar & Nouns", 3),
            ("Beginner", "Common Phrases & Verbs", 4),
            ("Beginner", "Simple Sentences & Conversations", 5),
            ("Intermediate", "Conversational Vocabulary", 6),
            ("Intermediate", "Verbs and Action Words", 7),
            ("Intermediate", "Grammar & Structure", 8),
            ("Advanced", "Complex Vocabulary", 9),
            ("Advanced", "Reading and Writing Tasks", 10),
            ("Advanced", "Fluency & Conversation", 11),
        ]
        outline = []
        for diff, category, seq in modules_data:
            lesson_titles = curated_module_lessons.get(seq, [f"Lesson {i}: {category}" for i in range(1, 11)])
            lessons_list = []
            for i, l_title in enumerate(lesson_titles, 1):
                clean_cat = "".join(x for x in category if x.isalnum()).lower()
                lessons_list.append({
                    "title_key": f"lesson_{clean_cat}_{i}",
                    "translated_title": l_title
                })
            outline.append({
                "difficulty_level": diff,
                "category": category,
                "sequence_order": seq,
                "lessons": lessons_list
            })

    # Insert curriculum, lessons, and content placeholders with user_id
    for module in outline:
        curr_id = await db.fetchval(
            """
            INSERT INTO curriculum (difficulty_level, category, sequence_order, target_language, native_language, user_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING curriculum_id;
            """,
            module["difficulty_level"],
            module["category"],
            module["sequence_order"],
            target_lang,
            native_lang,
            user_id
        )
        
        for lesson in module.get("lessons", []):
            t_key = lesson.get("title_key") or lesson.get("lesson_key") or lesson.get("key") or f"lesson_{curr_id}"
            trans_title = lesson.get("translated_title") or lesson.get("title") or lesson.get("translated") or t_key
            lesson_id = await db.fetchval(
                """
                INSERT INTO lessons (curriculum_id, title_key)
                VALUES ($1, $2)
                RETURNING lesson_id;
                """,
                curr_id,
                t_key
            )
            
            await db.execute(
                """
                INSERT INTO lesson_content (lesson_id, language_code, translated_title, body_text, exercise_data)
                VALUES ($1, $2, $3, '', '[]'::jsonb);
                """,
                lesson_id,
                native_lang,
                trans_title
            )



async def generate_module_lessons(curr_id: int, category: str, difficulty_level: str, target_lang: str, native_lang: str, db: asyncpg.Connection, user_id: Optional[int] = None):
    """
    Calls Gemini (using MODULE_GEN_KEY) to generate the 10 lesson contents (body_text, exercise_data) for a curriculum module,
    incorporating learner personalization context if user_id is provided.
    """
    lessons = await db.fetch(
        """
        SELECT lesson_id, title_key
        FROM lessons
        WHERE curriculum_id = $1
        ORDER BY lesson_id ASC;
        """,
        curr_id
    )
    if not lessons:
        return

    safe_category = "".join([c if c.isalnum() else "_" for c in category]).strip("_")
    cache_filename = f"lessons_{safe_category}_{difficulty_level}_{target_lang}_{native_lang}_u{user_id or 0}.json"
    cache_path = os.path.join(CACHE_DIR, cache_filename)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                lesson_contents = json.load(f)
            print(f"[CACHE HIT] Loaded lessons from file cache for module '{category}' ({target_lang}-{native_lang}, user: {user_id}).")
        except Exception as e:
            print(f"[CACHE ERROR] Failed to read lessons cache: {e}")
            lesson_contents = None
    else:
        lesson_contents = None

    if not lesson_contents:
        user_prompt_ctx = ""
        if user_id:
            s_row = await db.fetchrow("SELECT overall_proficiency FROM learner_scores WHERE user_id = $1 ORDER BY evaluated_at DESC LIMIT 1;", user_id)
            user_level = s_row["overall_proficiency"] if s_row and s_row.get("overall_proficiency") else difficulty_level
            user_prompt_ctx = f"The learner's current assigned proficiency level is '{user_level}'. Tailor explanation complexity accordingly."

        title_keys_str = ", ".join([f"'{l['title_key']}'" for l in lessons])
        prompt = f"""
        You are a warm, supportive, and encouraging personal language tutor. Generate the lesson content and exercises for 10 lessons in the module '{category}' at '{difficulty_level}' level, for a '{native_lang}' speaker learning '{target_lang}'.
        {user_prompt_ctx}
        Write all titles, body explanations, and exercise instructions in a clear, friendly, human-written tone. Do not use robotic or rigid AI language.
        The title keys for the 10 lessons are: {title_keys_str}.
        
        For each of these 10 lessons, you must generate:
        - "title_key": must match one of the keys exactly.
        - "translated_title": the title translated to/explained in '{native_lang}'
        - "body_text": a simple, clear lesson body (in '{target_lang}' with explanations/translations in '{native_lang}') teaching that topic.
        - "exercise_data": an array of EXACTLY 5 interactive questions covering ALL key skill pillars with SPECIAL EMPHASIS ON WRITING SKILLS:
          Every lesson's 'exercise_data' MUST contain questions to test and enhance writing skills, along with reading, listening, and comprehension:
          1. Type 'write': A dedicated writing exercise where the learner must write or type a complete phrase or sentence in '{target_lang}' (e.g., {{"type": "write", "instruction": "Writing Practice: Type or write your sentence in '{target_lang}':", "prompt": "Translate into '{target_lang}' or write a sentence using the key word", "answer": "Model correct sentence in '{target_lang}'", "min_words": 2}})
          2. Type 'read': The user reads a target language sentence aloud (e.g., {{"type": "read", "instruction": "Read aloud in '{target_lang}':", "text": "Target sentence in '{target_lang}'", "answer": "Target sentence in '{target_lang}'"}})
          3. Type 'listening': The user listens to a native audio prompt and selects what was spoken (e.g., {{"type": "listening", "instruction": "Listen to the audio pronunciation and identify what was spoken:", "audio_text": "Target phrase in '{target_lang}'", "question": "What did the speaker say?", "options": ["Target phrase in '{target_lang}'", "Distractor 1", "Distractor 2", "Distractor 3"], "answer": "Target phrase in '{target_lang}'"}})
          4. Type 'comprehension': A short context passage followed by an understanding question (e.g., {{"type": "comprehension", "instruction": "Read the short context and answer:", "passage": "Short 2-sentence scenario in '{target_lang}'", "question": "What happened in the scenario?", "options": ["Option 1", "Option 2", "Option 3", "Option 4"], "answer": "Option 1"}})
          5. Type 'quiz': An MCQ question testing vocabulary or grammar (e.g., {{"type": "quiz", "instruction": "Select the correct answer:", "question": "Question text?", "options": ["Choice 1", "Choice 2", "Choice 3", "Choice 4"], "answer": "Choice 1"}})

        Format the JSON response exactly as a JSON array of 10 objects. Return only the raw JSON.
        """

        def _validate_module_lessons(raw: str):
            clean_json = raw.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].split("```")[0].strip()
            start_idx = clean_json.find('[')
            end_idx = clean_json.rfind(']')
            if start_idx != -1 and end_idx != -1:
                clean_json = clean_json[start_idx:end_idx+1]
            parsed = json.loads(clean_json)
            if not isinstance(parsed, list) or len(parsed) == 0:
                raise ValueError("Lessons array is empty or not a list")
            return parsed

        try:
            res_text = await call_gemini_with_key_failover(
                prompt,
                for_module_gen=True,
                timeout=25,
                validator_fn=_parse_flexible_json_array
            )
            lesson_contents = _parse_flexible_json_array(res_text)
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(lesson_contents, f, ensure_ascii=False, indent=2)
                print(f"[CACHE WRITE] Saved lessons to file cache for module '{category}' ({target_lang}-{native_lang}, user: {user_id}).")
            except Exception as cache_err:
                print(f"[CACHE WRITE ERROR] Failed to write lessons cache: {cache_err}")
        except Exception as err:
            print(f"[AI GENERATION ERROR] Module lessons generation failed after trying all models: {err}")
            lesson_contents = None


    if not lesson_contents:
        # Fallback local content generation with dedicated writing exercises in every lesson
        lesson_contents = []
        for idx_l, l in enumerate(lessons):
            tkey = l["title_key"]
            clean_title = format_clean_human_title(None, tkey, category, idx_l)
            lesson_contents.append({
                "title_key": tkey,
                "translated_title": clean_title,
                "body_text": f"This lesson guides you through {category} in {target_lang.upper()}. Practice writing sentences, reading aloud, listening comprehension, and grammar.",
                "exercise_data": [
                    {
                        "type": "write",
                        "instruction": f"Writing Practice & Sentence Composition (1/5):",
                        "prompt": f"Write or type a complete sentence about {category} in {target_lang.upper()}:",
                        "answer": f"Hello {category}",
                        "min_words": 1
                    },
                    {
                        "type": "read",
                        "instruction": f"Reading Aloud Task (2/5):",
                        "text": f"Welcome to learning {target_lang.upper()}",
                        "answer": f"Welcome to learning {target_lang.upper()}"
                    },
                    {
                        "type": "listening",
                        "instruction": f"Listening Comprehension (3/5):",
                        "audio_text": f"Hello, how are you in {target_lang.upper()}?",
                        "question": "Listen carefully to the audio pronunciation. What phrase is spoken?",
                        "options": [f"Hello, how are you in {target_lang.upper()}?", "Thank you very much", "Good morning friend", "See you tomorrow"],
                        "answer": f"Hello, how are you in {target_lang.upper()}?"
                    },
                    {
                        "type": "comprehension",
                        "instruction": f"Reading Comprehension (4/5):",
                        "passage": f"Learning {target_lang.upper()} opens new opportunities to connect with millions of speakers worldwide every day.",
                        "question": "What is the primary benefit mentioned in the passage?",
                        "options": ["Connecting with millions of speakers worldwide", "Learning to drive", "Traveling into space", "Reading old novels"],
                        "answer": "Connecting with millions of speakers worldwide"
                    },
                    {
                        "type": "quiz",
                        "instruction": f"Knowledge Recall & Grammar (5/5):",
                        "question": f"What is the best approach to master {category} in {target_lang.upper()}?",
                        "options": ["Consistent daily practice with feedback", "Reading only once a month", "Skipping pronunciation", "Never speaking"],
                        "answer": "Consistent daily practice with feedback"
                    }
                ]
            })

    # Update database contents
    for idx, l_row in enumerate(lessons):
        db_title_key = l_row["title_key"]
        
        item = None
        if isinstance(lesson_contents, list):
            for candidate in lesson_contents:
                if not isinstance(candidate, dict):
                    continue
                cand_key = candidate.get("title_key") or candidate.get("titleKey") or candidate.get("key")
                if cand_key == db_title_key:
                    item = candidate
                    break
            
            if not item and idx < len(lesson_contents):
                candidate = lesson_contents[idx]
                if isinstance(candidate, dict):
                    item = candidate

        if not item:
            fallback_name = format_clean_human_title(None, db_title_key, category, idx)
            item = {
                "translated_title": fallback_name,
                "body_text": f"This lesson teaches basics about {category}. Practice writing, reading, and speaking target phrases.",
                "exercise_data": [
                    {
                        "type": "write",
                        "instruction": f"Writing Composition Task (1/5):",
                        "prompt": f"Write or type a complete phrase in {target_lang.upper()}:",
                        "answer": f"Hello",
                        "min_words": 1
                    },
                    {
                        "type": "read",
                        "instruction": f"Reading Aloud Task (2/5):",
                        "text": f"I want to learn {target_lang} fluently.",
                        "answer": f"I want to learn {target_lang} fluently."
                    },
                    {
                        "type": "listening",
                        "instruction": f"Listening Comprehension (3/5):",
                        "audio_text": f"Welcome to our {target_lang} lesson.",
                        "question": "Listen to the audio. What was spoken?",
                        "options": [f"Welcome to our {target_lang} lesson.", "Goodbye friend", "Thank you", "Good night"],
                        "answer": f"Welcome to our {target_lang} lesson."
                    },
                    {
                        "type": "comprehension",
                        "instruction": f"Context Reading (4/5):",
                        "passage": f"Daily writing and reading in {target_lang.upper()} helps build permanent memory.",
                        "question": f"What helps build permanent memory?",
                        "options": [f"Daily writing and reading in {target_lang.upper()}", "Sleeping all day", "Ignoring lessons", "Watching cartoons"],
                        "answer": f"Daily writing and reading in {target_lang.upper()}"
                    },
                    {
                        "type": "quiz",
                        "instruction": f"Select the correct option (5/5):",
                        "question": f"How do you master {category}?",
                        "options": ["Practice daily", "Read once a year", "Skip lessons", "Never write"],
                        "answer": "Practice daily"
                    }
                ]
            }

        raw_item_title = item.get("translated_title") or item.get("translatedTitle") or item.get("title")
        translated_title = format_clean_human_title(raw_item_title, db_title_key, category, idx)
        body_text = item.get("body_text") or item.get("bodyText") or item.get("body") or f"Practicing lesson context for {category}."
        exercise_data = item.get("exercise_data") or item.get("exerciseData") or item.get("exercise") or [
            {
                "type": "write",
                "instruction": f"Writing Composition Task (1/5):",
                "prompt": f"Write or type a complete phrase in {target_lang.upper()}:",
                "answer": f"Hello",
                "min_words": 1
            },
            {
                "type": "read",
                "instruction": f"Read this text aloud to practice '{target_lang}' (2/5):",
                "text": f"I want to learn {target_lang} fluently.",
                "answer": f"I want to learn {target_lang} fluently."
            },
            {
                "type": "listening",
                "instruction": f"Listening Comprehension (3/5):",
                "audio_text": f"Welcome to our {target_lang} lesson.",
                "question": "Listen to the audio. What was spoken?",
                "options": [f"Welcome to our {target_lang} lesson.", "Goodbye friend", "Thank you", "Good night"],
                "answer": f"Welcome to our {target_lang} lesson."
            },
            {
                "type": "comprehension",
                "instruction": f"Reading Comprehension (4/5):",
                "passage": f"Daily writing and reading in {target_lang.upper()} helps build permanent memory.",
                "question": f"What helps build permanent memory?",
                "options": [f"Daily writing and reading in {target_lang.upper()}", "Sleeping all day", "Ignoring lessons", "Watching cartoons"],
                "answer": f"Daily writing and reading in {target_lang.upper()}"
            },
            {
                "type": "quiz",
                "instruction": f"Translate & Recall (5/5):",
                "question": f"What is the best way to learn {target_lang}?",
                "options": ["Practice daily", "Read once", "Ignore", "Sleep"],
                "answer": "Practice daily"
            }
        ]

        await db.execute(
            """
            UPDATE lesson_content
            SET translated_title = $1, body_text = $2, exercise_data = $3
            WHERE lesson_id = $4 AND language_code = $5;
            """,
            translated_title,
            body_text,
            json.dumps(exercise_data),
            l_row["lesson_id"],
            native_lang
        )


def format_clean_human_title(raw_title: Optional[str], db_title_key: str, category: str, idx: int) -> str:
    clean_cat = category.split("(")[0].strip()
    if not raw_title:
        return f"Lesson {idx + 1}: {clean_cat}"
    t_lower = raw_title.lower()
    if any(k in t_lower for k in ["alphabetsounds", "alphabetssounds", "complexvocabulary", "basicwords", "simplegrammar", "commonphrases", "simplesentences", "lesson_"]):
        return f"Lesson {idx + 1}: {clean_cat}"
    if raw_title.startswith("Lesson: "):
        clean_inner = raw_title.replace("Lesson:", "").strip()
        if any(k in clean_inner.lower() for k in ["alphabetssounds", "complexvocabulary", "alphabetsounds"]):
            return f"Lesson {idx + 1}: {clean_cat}"
        return f"Lesson {idx + 1}: {clean_inner}"
    return raw_title


@router.get("", response_model=List[CurriculumResponse])
async def get_curriculum(
    lang: str = Query("en", description="Language code ('en', 'hi', 'kn')"), 
    target_lang: Optional[str] = Query(None, description="Target language to learn"),
    user_id: Optional[int] = Query(None, description="ID of the learner for personalized AI curriculum"),
    track: Optional[str] = Query(None, description="Filter/generate specific track: 'Beginner', 'Intermediate', 'Advanced'"),
    force_regenerate: bool = Query(False, description="Force re-querying Gemini AI to regenerate rich lesson details"),
    db: asyncpg.Connection = Depends(get_db)
):
    """
    Fetches the personalized AI curriculum roadmap structure for a specific user or global fallback.
    Staged Generation Strategy: First generates ONLY the 'Beginner' track fully (teaching language fundamentals from absolute basics),
    and generates 'Intermediate' or 'Advanced' tracks on-demand when requested by the learner, preserving API limits.
    """
    native_lang_code = lang.lower()
    target_lang_code = (target_lang or "en").lower()

    # 1. Check if personalized curriculum outline exists for this user + target & native language pair
    if user_id:
        curriculum_check = await db.fetchrow(
            """
            SELECT curriculum_id 
            FROM curriculum 
            WHERE target_language = $1 AND native_language = $2 AND user_id = $3
            LIMIT 1;
            """,
            target_lang_code,
            native_lang_code,
            user_id
        )
    else:
        curriculum_check = await db.fetchrow(
            """
            SELECT curriculum_id 
            FROM curriculum 
            WHERE target_language = $1 AND native_language = $2 AND (user_id IS NULL OR user_id = 0)
            LIMIT 1;
            """,
            target_lang_code,
            native_lang_code
        )

    # 2. If it does not exist, trigger outline generation
    if not curriculum_check:
        print(f"Curriculum not found for target_lang={target_lang_code}, native_lang={native_lang_code}, user_id={user_id}. Generating personalized AI curriculum outline...")
        await generate_curriculum_outline(target_lang_code, native_lang_code, db, user_id=user_id)

    # 3. Query modules (curriculum categories)
    if user_id:
        curriculum_rows = await db.fetch(
            """
            SELECT curriculum_id, difficulty_level, category, sequence_order
            FROM curriculum
            WHERE target_language = $1 AND native_language = $2 AND user_id = $3
            ORDER BY sequence_order ASC;
            """,
            target_lang_code,
            native_lang_code,
            user_id
        )
        if not curriculum_rows:
            curriculum_rows = await db.fetch(
                """
                SELECT curriculum_id, difficulty_level, category, sequence_order
                FROM curriculum
                WHERE target_language = $1 AND native_language = $2 AND (user_id IS NULL OR user_id = 0)
                ORDER BY sequence_order ASC;
                """,
                target_lang_code,
                native_lang_code
            )
    else:
        curriculum_rows = await db.fetch(
            """
            SELECT curriculum_id, difficulty_level, category, sequence_order
            FROM curriculum
            WHERE target_language = $1 AND native_language = $2 AND (user_id IS NULL OR user_id = 0)
            ORDER BY sequence_order ASC;
            """,
            target_lang_code,
            native_lang_code
        )

    # 4. Staged Generation: Generate lesson details for Beginner track fully first, or for specifically requested track
    active_requested_track = (track or "Beginner").capitalize()
    for c_row in curriculum_rows:
        curr_id = c_row["curriculum_id"]
        diff_level = c_row["difficulty_level"]

        # Only call AI generation for Beginner track OR the explicitly requested track
        should_generate_ai = (diff_level == "Beginner") or (track is not None and diff_level == active_requested_track)

        empty_check = await db.fetchval(
            """
            SELECT COUNT(*) 
            FROM lesson_content lc
            INNER JOIN lessons l ON lc.lesson_id = l.lesson_id
            WHERE l.curriculum_id = $1 AND (lc.body_text IS NULL OR lc.body_text = '');
            """,
            curr_id
        )
        ugly_check = await db.fetchval(
            """
            SELECT COUNT(*)
            FROM lesson_content lc
            INNER JOIN lessons l ON lc.lesson_id = l.lesson_id
            WHERE l.curriculum_id = $1 AND (
                lc.translated_title ILIKE '%alphabetssounds%' OR
                lc.translated_title ILIKE '%complexvocabulary%' OR
                lc.translated_title ILIKE '%lesson_%'
            );
            """,
            curr_id
        )
        if force_regenerate and should_generate_ai:
            print(f"[FORCE REGENERATE] Re-generating AI lesson details for module: '{c_row['category']}'...")
            await generate_module_lessons(curr_id, c_row["category"], c_row["difficulty_level"], target_lang_code, native_lang_code, db, user_id=user_id)
        elif (empty_check > 0 or ugly_check > 0) and should_generate_ai:
            print(f"[AI GENERATE] Generating full AI lesson details for {diff_level} module: '{c_row['category']}' (ID: {curr_id}, user_id: {user_id})...")
            await generate_module_lessons(curr_id, c_row["category"], c_row["difficulty_level"], target_lang_code, native_lang_code, db, user_id=user_id)
        elif empty_check > 0:
            # Fast placeholder initialization without consuming AI API rate limits
            print(f"[STAGED GEN SKIP] Deferring AI generation for non-active track module: '{c_row['category']}' ({diff_level}).")
            lessons_to_init = await db.fetch("SELECT lesson_id, title_key FROM lessons WHERE curriculum_id = $1;", curr_id)
            for idx_init, l_item in enumerate(lessons_to_init):
                t_title = format_clean_human_title(None, l_item['title_key'], c_row['category'], idx_init)
                b_text = f"This lesson covers {diff_level} concepts for {c_row['category']}. Select this track to generate full AI exercises."
                init_ex = [
                    {"type": "read", "instruction": f"Read aloud ({target_lang_code.upper()}):", "text": f"Learning {c_row['category']} step by step.", "answer": f"Learning {c_row['category']} step by step."},
                    {"type": "quiz", "instruction": "Select the correct option:", "question": f"What level is this module?", "options": [diff_level, "Beginner", "Intermediate", "Advanced"], "answer": diff_level},
                    {"type": "pictorial", "instruction": "Identify object:", "question": "What is this? 📖", "options": ["Book", "Pen", "Desk", "Phone"], "answer": "Book"},
                    {"type": "read", "instruction": "Practice phrase:", "text": f"I am mastering {c_row['category']}.", "answer": f"I am mastering {c_row['category']}."},
                    {"type": "quiz", "instruction": "Check comprehension:", "question": f"Key focus of {c_row['category']}?", "options": ["Language skills", "Math", "Science", "History"], "answer": "Language skills"}
                ]
                await db.execute(
                    """
                    UPDATE lesson_content
                    SET translated_title = $1, body_text = $2, exercise_data = $3
                    WHERE lesson_id = $4 AND language_code = $5 AND (body_text IS NULL OR body_text = '');
                    """,
                    t_title, b_text, json.dumps(init_ex), l_item["lesson_id"], native_lang_code
                )

    # 5. Fetch complete curriculum with lessons and populated content
    curr_ids = [c["curriculum_id"] for c in curriculum_rows]
    rows = await db.fetch(
        """
        SELECT 
            c.curriculum_id,
            c.difficulty_level,
            c.category,
            c.sequence_order,
            l.lesson_id,
            l.title_key,
            lc.translated_title,
            lc.body_text,
            lc.exercise_data
        FROM curriculum c
        INNER JOIN lessons l ON c.curriculum_id = l.curriculum_id
        LEFT JOIN lesson_content lc ON l.lesson_id = lc.lesson_id AND lc.language_code = $1
        WHERE c.curriculum_id = ANY($2::int[])
        ORDER BY c.sequence_order ASC, l.lesson_id ASC;
        """,
        native_lang_code,
        curr_ids
    )
    
    curriculums = {}
    for row in rows:
        curriculum_id = row["curriculum_id"]
        if curriculum_id not in curriculums:
            curriculums[curriculum_id] = {
                "curriculum_id": curriculum_id,
                "difficulty_level": row["difficulty_level"],
                "category": row["category"],
                "sequence_order": row["sequence_order"],
                "lessons": []
            }
        
        raw_exercise_data = row["exercise_data"]
        exercise_data = None
        if raw_exercise_data is not None:
            if isinstance(raw_exercise_data, str):
                try:
                    exercise_data = json.loads(raw_exercise_data)
                except ValueError:
                    exercise_data = {"error_parsing": True, "raw_content": raw_exercise_data}
            else:
                exercise_data = raw_exercise_data
        
        if row["lesson_id"] is not None:
            idx_num = len(curriculums[curriculum_id]["lessons"])
            clean_title = format_clean_human_title(row["translated_title"], row["title_key"], row["category"], idx_num)
            lesson = LessonResponse(
                lesson_id=row["lesson_id"],
                title_key=row["title_key"],
                translated_title=clean_title,
                body_text=row["body_text"] or "",
                exercise_data=exercise_data
            )
            curriculums[curriculum_id]["lessons"].append(lesson)
            
    result = list(curriculums.values())
    result.sort(key=lambda x: x["sequence_order"])
    return result


import urllib.request
import os
import random
import asyncio

# Schema for generated exercise
# Schema for generated exercise
class GeneratedExerciseResponse(BaseModel):
    type: str  # pictorial, text_based, voice_based, reading_based, learning_based, read, quiz
    instruction: str
    text: Optional[str] = None
    passage: Optional[str] = None
    concept_explanation: Optional[str] = None
    question: Optional[str] = None
    options: Optional[List[str]] = None
    answer: str
    hint: Optional[str] = None
    svg_icon: Optional[str] = None
    audio_prompt: Optional[str] = None

# Seeded fallback questions supporting all 5 modalities across target languages
FALLBACK_EXERCISES = {
    "en": {
        "Beginner": [
            {
                "type": "pictorial",
                "instruction": "Identify the object shown in the visual illustration:",
                "question": "What object is represented here?",
                "svg_icon": "apple",
                "options": ["Apple", "Car", "Tree", "Book"],
                "answer": "Apple",
                "hint": "It is a sweet red fruit that grows on trees."
            },
            {
                "type": "text_based",
                "instruction": "Fill in the blank with the correct word:",
                "question": "The sun rises in the ____ every morning.",
                "options": ["East", "West", "Water", "Night"],
                "answer": "East",
                "hint": "Think about direction."
            },
            {
                "type": "voice_based",
                "instruction": "Listen to the native pronunciation and repeat out loud:",
                "text": "Good morning, friend!",
                "audio_prompt": "Good morning, friend!",
                "answer": "Good morning, friend!"
            },
            {
                "type": "reading_based",
                "instruction": "Read the short passage and answer the question below:",
                "passage": "Ramu has a small white dog named Tommy. Tommy loves playing with a blue ball in the park.",
                "question": "What is the dog's name?",
                "options": ["Ramu", "Tommy", "Park", "Blue"],
                "answer": "Tommy"
            },
            {
                "type": "learning_based",
                "instruction": "Learn this basic word concept and test your memory:",
                "concept_explanation": "💡 Concept: 'Greetings'\nIn English, we say 'Thank you' to show gratitude when someone helps us.",
                "question": "Which phrase expresses gratitude in English?",
                "options": ["Hello", "Goodbye", "Thank you", "Sorry"],
                "answer": "Thank you"
            }
        ],
        "Intermediate": [
            {
                "type": "pictorial",
                "instruction": "Match the visual action scene with the correct action verb:",
                "question": "What action is being depicted?",
                "svg_icon": "running",
                "options": ["Sleeping", "Running", "Writing", "Cooking"],
                "answer": "Running"
            },
            {
                "type": "text_based",
                "instruction": "Select the correct action verb for the sentence:",
                "question": "She ____ a red bicycle to school every day.",
                "options": ["rides", "eats", "sings", "thinks"],
                "answer": "rides"
            },
            {
                "type": "voice_based",
                "instruction": "Listen carefully and speak the complete sentence:",
                "text": "Regular practice helps build language fluency and confidence.",
                "audio_prompt": "Regular practice helps build language fluency and confidence.",
                "answer": "Regular practice helps build language fluency and confidence."
            },
            {
                "type": "reading_based",
                "instruction": "Read the story passage and answer the comprehension question:",
                "passage": "Anita visited the local farmer's market on Saturday morning. She bought fresh green spinach, ripe mangoes, and honey. The vendor gave her a discount.",
                "question": "Where did Anita go on Saturday morning?",
                "options": ["To the school", "To the farmer's market", "To the bank", "To the hospital"],
                "answer": "To the farmer's market"
            },
            {
                "type": "learning_based",
                "instruction": "Study the grammar rule and select the correct usage:",
                "concept_explanation": "💡 Grammar Tip: Action Verbs (Present Tense)\nFor singular subjects like 'He', 'She', or 'It', add '-s' or '-es' to the verb (e.g. He runs, She cooks).",
                "question": "Which sentence follows the correct singular verb rule?",
                "options": ["She cook dinner.", "She cooks dinner.", "She cooking dinner.", "She cookes dinner."],
                "answer": "She cooks dinner."
            }
        ],
        "Advanced": [
            {
                "type": "pictorial",
                "instruction": "Identify the professional visual setting:",
                "question": "Which category best fits this visual symbol?",
                "svg_icon": "briefcase",
                "options": ["Career & Work", "Entertainment", "Sports", "Agriculture"],
                "answer": "Career & Work"
            },
            {
                "type": "text_based",
                "instruction": "Choose the most formal and grammatically correct option:",
                "question": "Please find attached the report for your ____.",
                "options": ["perusal", "playing", "sleeping", "forgetting"],
                "answer": "perusal"
            },
            {
                "type": "voice_based",
                "instruction": "Practice speaking this professional introduction:",
                "text": "I am eager to contribute my skills to community development projects.",
                "audio_prompt": "I am eager to contribute my skills to community development projects.",
                "answer": "I am eager to contribute my skills to community development projects."
            },
            {
                "type": "reading_based",
                "instruction": "Read the paragraph and answer the analytical question:",
                "passage": "Digital literacy is no longer a luxury; it is a fundamental tool for economic empowerment and lifelong learning in modern society.",
                "question": "According to the passage, why is digital literacy essential?",
                "options": ["For economic empowerment and learning", "Only for playing games", "It is no longer useful", "To replace traditional schools"],
                "answer": "For economic empowerment and learning"
            },
            {
                "type": "learning_based",
                "instruction": "Examine the formal communication concept:",
                "concept_explanation": "💡 Concept: Formal Email Greetings\nIn professional correspondence, start with 'Dear [Name/Title]' followed by a respectful opening.",
                "question": "Which greeting is suitable for an official request email?",
                "options": ["Hey buddy!", "Dear Manager,", "What's up!", "Yo!"],
                "answer": "Dear Manager,"
            }
        ]
    },
    "hi": {
        "Beginner": [
            {
                "type": "pictorial",
                "instruction": "चित्र में दिखाई गई वस्तु को पहचानें:",
                "question": "यह कौन सी वस्तु है?",
                "svg_icon": "car",
                "options": ["कार", "घर", "किताब", "पेड़"],
                "answer": "कार",
                "hint": "यह सड़क पर चलती है और पहिये होते हैं।"
            },
            {
                "type": "text_based",
                "instruction": "खाली स्थान भरें:",
                "question": "सूर्य _____ दिशा से उगता है।",
                "options": ["पूर्व", "पश्चिम", "पानी", "रात"],
                "answer": "पूर्व",
                "hint": "दिशा का ध्यान रखें।"
            },
            {
                "type": "voice_based",
                "instruction": "उच्चारण सुनें और इसे जोर से दोहराएं:",
                "text": "नमस्ते, आप कैसे हैं?",
                "audio_prompt": "नमस्ते, आप कैसे हैं?",
                "answer": "नमस्ते, आप कैसे हैं?"
            },
            {
                "type": "reading_based",
                "instruction": "छोटे गद्यांश को पढ़ें और प्रश्न का उत्तर दें:",
                "passage": "राम के पास एक छोटी सफेद बिल्ली है। उसका नाम मानो है। मानो दूध पीना पसंद करती है।",
                "question": "बिल्ली को क्या पीना पसंद है?",
                "options": ["पानी", "दूध", "चाय", "फल"],
                "answer": "दूध"
            },
            {
                "type": "learning_based",
                "instruction": "इस भाषा नियम को समझें और उत्तर दें:",
                "concept_explanation": "💡 पाठ अवधारणा: 'अभिवादन'\nहिंदी में किसी से मिलने पर हम सम्मानपूर्वक 'नमस्ते' या 'प्रणाम' कहते हैं।",
                "question": "किसी से मिलने पर कौन सा शब्द अभिवादन के लिए प्रयोग होता है?",
                "options": ["नमस्ते", "बाय", "अलविदा", "रोना"],
                "answer": "नमस्ते"
            }
        ],
        "Intermediate": [
            {
                "type": "pictorial",
                "instruction": "दृश्य प्रतीक को सही कार्य से मिलाएं:",
                "question": "चित्र में क्या दर्शाया गया है?",
                "svg_icon": "writing",
                "options": ["लिखना", "सोना", "दौड़ना", "खाना"],
                "answer": "लिखना"
            },
            {
                "type": "text_based",
                "instruction": "वाक्य के लिए सही क्रिया शब्द चुनें:",
                "question": "सीता रोज सुबह पार्क में _____ है।",
                "options": ["टहलती", "सोती", "खाती", "लिखती"],
                "answer": "टहलती"
            },
            {
                "type": "voice_based",
                "instruction": "वाक्य को ध्यान से सुनें और बोलें:",
                "text": "रोजाना अभ्यास करने से पढ़ाई आसान हो जाती है।",
                "audio_prompt": "रोजाना अभ्यास करने से पढ़ाई आसान हो जाती है।",
                "answer": "रोजाना अभ्यास करने से पढ़ाई आसान हो जाती है।"
            },
            {
                "type": "reading_based",
                "instruction": "गद्यांश पढ़ें और उत्तर दें:",
                "passage": "मोहन शनिवार को बाजार गया। उसने ताजे आम, सेब और सब्जियां खरीदीं। दुकानदार ने उसे छूट भी दी।",
                "question": "मोहन शनिवार को कहां गया?",
                "options": ["बाजार", "स्कूल", "अस्पताल", "सिनेमा"],
                "answer": "बाजार"
            },
            {
                "type": "learning_based",
                "instruction": "व्याकरण नियम सीखें और सही उत्तर चुनें:",
                "concept_explanation": "💡 व्याकरण नियम: लिंग भेद\nपुरुष के लिए 'जाता है' और स्त्री के लिए 'जाती है' का प्रयोग होता है।",
                "question": "'लड़की स्कूल ____ है।' में सही शब्द क्या होगा?",
                "options": ["जाता", "जाती", "सोता", "खाता"],
                "answer": "जाती"
            }
        ],
        "Advanced": [
            {
                "type": "pictorial",
                "instruction": "व्यावसायिक प्रतीक पहचानें:",
                "question": "यह प्रतीक किस क्षेत्र का प्रतिनिधित्व करता है?",
                "svg_icon": "briefcase",
                "options": ["रोजगार एवं कार्य", "खेलकूद", "मनोरंजन", "कृषि"],
                "answer": "रोजगार एवं कार्य"
            },
            {
                "type": "text_based",
                "instruction": "उचित औपचारिक शब्द से वाक्य पूरा करें:",
                "question": "कृपया इस आवेदन पत्र पर अपने हस्ताक्षर _____ करें।",
                "options": ["अंकित", "उड़ा", "भुला", "तोड़"],
                "answer": "अंकित"
            },
            {
                "type": "voice_based",
                "instruction": "इस औपचारिक वाक्य का उच्चारण अभ्यास करें:",
                "text": "डिजिटल साक्षरता हमारे समाज के विकास के लिए अत्यंत आवश्यक है।",
                "audio_prompt": "डिजिटल साक्षरता हमारे समाज के विकास के लिए अत्यंत आवश्यक है।",
                "answer": "डिजिटल साक्षरता हमारे समाज के विकास के लिए अत्यंत आवश्यक है।"
            },
            {
                "type": "reading_based",
                "instruction": "अनुच्छेद पढ़ें और विचारपूर्ण प्रश्न का उत्तर दें:",
                "passage": "अक्षरज्ञान और डिजिटल दक्षता से लोग नए अवसर प्राप्त कर सकते हैं तथा स्वावलंबी बन सकते हैं।",
                "question": "अक्षरज्ञान का मुख्य लाभ क्या है?",
                "options": ["स्वावलंबी बनना और नए अवसर पाना", "केवल समय बिताना", "दौड़ना", "केवल सोना"],
                "answer": "स्वावलंबी बनना और नए अवसर पाना"
            },
            {
                "type": "learning_based",
                "instruction": "औपचारिक पत्राचार नियम पढ़ें:",
                "concept_explanation": "💡 पत्राचार नियम: प्रार्थना पत्र\nकिसी अधिकारी को पत्र लिखते समय 'माननीय' या 'महोदय' का प्रयोग किया जाता है।",
                "question": "प्रधानाचार्य को पत्र में संबोधन के लिए कौन सा शब्द सही है?",
                "options": ["आदरणीय / महोदय", "अरे दोस्त", "हेलो भाई", "नमस्ते यार"],
                "answer": "आदरणीय / महोदय"
            }
        ]
    },
    "kn": {
        "Beginner": [
            {
                "type": "pictorial",
                "instruction": "ಚಿತ್ರದಲ್ಲಿರುವ ವಸ್ತುವನ್ನು ಗುರುತಿಸಿ:",
                "question": "ಈ ಚಿತ್ರವು ಏನನ್ನು ಸೂಚಿಸುತ್ತದೆ?",
                "svg_icon": "house",
                "options": ["ಮನೆ", "ಮರ", "ನೀರು", "ಹಣ್ಣು"],
                "answer": "ಮನೆ",
                "hint": "ನಾವು ವಾಸಿಸುವ ಸ್ಥಳ."
            },
            {
                "type": "text_based",
                "instruction": "ಖಾಲಿ ಜಾಗವನ್ನು ತುಂಬಿರಿ:",
                "question": "ಸೂರ್ಯನು _____ ದಿಕ್ಕಿನಲ್ಲಿ ಮೂಡುತ್ತಾನೆ.",
                "options": ["ಪೂರ್ವ", "ಪಶ್ಚಿಮ", "ರಾತ್ರಿ", "ಕಾಡು"],
                "answer": "ಪೂರ್ವ"
            },
            {
                "type": "voice_based",
                "instruction": "ಉಚ್ಚಾರಣೆಯನ್ನು ಕೇಳಿ ಗಟ್ಟಿಯಾಗಿ ಹೇಳಿ:",
                "text": "ಶುಭೋದಯ, ನೀವು ಹೇಗಿದ್ದೀರಿ?",
                "audio_prompt": "ಶುಭೋದಯ, ನೀವು ಹೇಗಿದ್ದೀರಿ?",
                "answer": "ಶುಭೋದಯ, ನೀವು ಹೇಗಿದ್ದೀರಿ?"
            },
            {
                "type": "reading_based",
                "instruction": "ಚಿಕ್ಕ ಪ್ಯಾರಾವನ್ನು ಓದಿ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಿ:",
                "passage": "ರಾಜುವಿನ ಬಳಿ ಬಿಳಿ ಬಣ್ಣದ ನಾಯಿ ಇದೆ. ಅದರ ಹೆಸರು ಟಾಮಿ. ಟಾಮಿಗೆ ಚೆಂಡಿನೊಂದಿಗೆ ಆಟವಾಡುವುದೆಂದರೆ ಇಷ್ಟ.",
                "question": "ನಾಯಿಯ ಹೆಸರೇನು?",
                "options": ["ರಾಜು", "ಟಾಮಿ", "ಚೆಂಡು", "ಮನೆ"],
                "answer": "ಟಾಮಿ"
            },
            {
                "type": "learning_based",
                "instruction": "ಈ ಪದದ ಪರಿಕಲ್ಪನೆಯನ್ನು ಕಲಿಯಿರಿ:",
                "concept_explanation": "💡 ಪರಿಕಲ್ಪನೆ: 'ಶುಭಾಶಯ'\nಕನ್ನಡದಲ್ಲಿ ಯಾರನ್ನಾದರೂ ಭೇಟಿಯಾದಾಗ ಗೌರವದಿಂದ 'ನಮಸ್ಕಾರ' ಎಂದು ಹೇಳುತ್ತೇವೆ.",
                "question": "ಕನ್ನಡದಲ್ಲಿ ಯಾರನ್ನಾದರೂ ಗೌರವದಿಂದ ಭೇಟಿಯಾದಾಗ ಏನು ಹೇಳುತ್ತೇವೆ?",
                "options": ["ನಮಸ್ಕಾರ", "ಬೈ", "ಹೋಗು", "ತಿನ್ನು"],
                "answer": "ನಮಸ್ಕಾರ"
            }
        ],
        "Intermediate": [
            {
                "type": "pictorial",
                "instruction": "ಚಿತ್ರದ ಕ್ರಿಯೆಯನ್ನು ಗುರುತಿಸಿ:",
                "question": "ಈ ಚಿತ್ರದಲ್ಲಿ ಏನು ನಡೆಯುತ್ತಿದೆ?",
                "svg_icon": "reading",
                "options": ["ಓದುವುದು", "ಮಲಗುವುದು", "ಓಡುವುದು", "ಅಡುಗೆ"],
                "answer": "ಓದುವುದು"
            },
            {
                "type": "text_based",
                "instruction": "ಸರಿಯಾದ ಕ್ರಿಯಾಪದವನ್ನು ಆರಿಸಿ:",
                "question": "ಅವಳು ಪ್ರತಿದಿನ ಶಾಲೆಗೆ _____.",
                "options": ["ಹೋಗುತ್ತಾಳೆ", "ತಿನ್ನುತ್ತಾಳೆ", "ಮಲಗುತ್ತಾಳೆ", "ಬರೆಯುತ್ತಾಳೆ"],
                "answer": "ಹೋಗುತ್ತಾಳೆ"
            },
            {
                "type": "voice_based",
                "instruction": "ವಾಕ್ಯವನ್ನು ಕೇಳಿ ಸ್ಪಷ್ಟವಾಗಿ ಉಚ್ಚರಿಸಿ:",
                "text": "ದಿನನಿತ್ಯದ ಅಭ್ಯಾಸದಿಂದ ಕಲಿವಿಕೆ ಸುಲಭವಾಗುತ್ತದೆ.",
                "audio_prompt": "ದಿನನಿತ್ಯದ ಅಭ್ಯಾಸದಿಂದ ಕಲಿವಿಕೆ ಸುಲಭವಾಗುತ್ತದೆ.",
                "answer": "ದಿನನಿತ್ಯದ ಅಭ್ಯಾಸದಿಂದ ಕಲಿವಿಕೆ ಸುಲಭವಾಗುತ್ತದೆ."
            },
            {
                "type": "reading_based",
                "instruction": "ಪ್ಯಾರಾವನ್ನು ಓದಿ ಉತ್ತರಿಸಿ:",
                "passage": "ಸುಮ ಶನಿವಾರ ಮಾರುಕಟ್ಟೆಗೆ ಹೋದಳು. ಅವಳು ತಾಜಾ ತರಕಾರಿ ಮತ್ತು ಹಣ್ಣುಗಳನ್ನು ಕೊಂಡಳು.",
                "question": "ಸುಮ ಎಲ್ಲಿಗೆ ಹೋದಳು?",
                "options": ["ಮಾರುಕಟ್ಟೆಗೆ", "ಬ್ಯಾಂಕ್‌ಗೆ", "ಆಸ್ಪತ್ರೆಗೆ", "ಶಾಲೆಗೆ"],
                "answer": "ಮಾರುಕಟ್ಟೆಗೆ"
            },
            {
                "type": "learning_based",
                "instruction": "ವ್ಯಾಕರಣ ನಿಯಮವನ್ನು ಕಲಿಯಿರಿ:",
                "concept_explanation": "💡 ವ್ಯಾಕರಣ ನಿಯಮ: ಲಿಂಗ ವೈವಿಧ್ಯ\nಪುಲ್ಲಿಂಗಕ್ಕೆ 'ಹೋಗುತ್ತಾನೆ', ಸ್ತ್ರೀಲಿಂಗಕ್ಕೆ 'ಹೋಗುತ್ತಾಳೆ' ಎಂದು ಬಳಸಲಾಗುತ್ತದೆ.",
                "question": "'ಅವನು ಮನೆಗೆ _____' - ಖಾಲಿ ಜಾಗಕ್ಕೆ ಸರಿಯಾದ ಪದ ಯಾವುದು?",
                "options": ["ಹೋಗುತ್ತಾನೆ", "ಹೋಗುತ್ತಾಳೆ", "ತಿನ್ನುತ್ತಾಳೆ", "ಓದುತ್ತಾಳೆ"],
                "answer": "ಹೋಗುತ್ತಾನೆ"
            }
        ],
        "Advanced": [
            {
                "type": "pictorial",
                "instruction": "ಚಿತ್ರದ ವೃತ್ತಿ ಕ್ಷೇತ್ರವನ್ನು ಗುರುತಿಸಿ:",
                "question": "ಈ ಚಿಹ್ನೆಯು ಯಾವುದಕ್ಕೆ ಸಂಬಂಧಿಸಿದೆ?",
                "svg_icon": "briefcase",
                "options": ["ಉದ್ಯೋಗ ಮತ್ತು ಕೆಲಸ", "ಕ್ರೀಡೆ", "ಸಂಗೀತ", "ಪ್ರಯಾಣ"],
                "answer": "ಉದ್ಯೋಗ ಮತ್ತು ಕೆಲಸ"
            },
            {
                "type": "text_based",
                "instruction": "ಸರಿಯಾದ ಪದದಿಂದ ಪೂರ್ಣಗೊಳಿಸಿ:",
                "question": "ದಯವಿಟ್ಟು ಈ ಅರ್ಜಿ ನಮೂನೆಯನ್ನು ಸರಿಯಾಗಿ _____ ಮಾಡಿ.",
                "options": ["ಭರ್ತಿ", "ನಾಶ", "ಮರೆತು", "ಚೆಲ್ಲಿ"],
                "answer": "ಭರ್ತಿ"
            },
            {
                "type": "voice_based",
                "instruction": "ಈ ವಾಕ್ಯವನ್ನು ಗಟ್ಟಿಯಾಗಿ ಓದಿ:",
                "text": "ಅಕ್ಷರಸ್ಥ ಸಮಾಜವು ಪ್ರಗತಿಶೀಲ ರಾಷ್ಟ್ರದ ಅಡಿಪಾಯವಾಗಿದೆ.",
                "audio_prompt": "ಅಕ್ಷರಸ್ಥ ಸಮಾಜವು ಪ್ರಗತಿಶೀಲ ರಾಷ್ಟ್ರದ ಅಡಿಪಾಯವಾಗಿದೆ.",
                "answer": "ಅಕ್ಷರಸ್ಥ ಸಮಾಜವು ಪ್ರಗತಿಶೀಲ ರಾಷ್ಟ್ರದ ಅಡಿಪಾಯವಾಗಿದೆ."
            },
            {
                "type": "reading_based",
                "instruction": "ಪ್ಯಾರಾವನ್ನು ಓದಿ ಪ್ರಶ್ನೆಗೆ ಉತ್ತರಿಸಿ:",
                "passage": "ಡಿಜಿಟಲ್ ಸಾಕ್ಷರತೆಯು ಪ್ರತಿಯೊಬ್ಬ ನಾಗರಿಕನಿಗೂ ನವೀನ ಅವಕಾಶಗಳನ್ನು ಕಲ್ಪಿಸುತ್ತದೆ.",
                "question": "ಡಿಜಿಟಲ್ ಸಾಕ್ಷರತೆಯ ಮುಖ್ಯ ಅನುಕೂಲವೇನು?",
                "options": ["ನವೀನ ಅವಕಾಶಗಳನ್ನು ಕಲ್ಪಿಸುವುದು", "ಕೇವಲ ಆಟವಾಡುವುದು", "ನಿದ್ರೆ ಮಾಡುವುದು", "ಆಹಾರ ಸೇವನೆ"],
                "answer": "ನವೀನ ಅವಕಾಶಗಳನ್ನು ಕಲ್ಪಿಸುವುದು"
            },
            {
                "type": "learning_based",
                "instruction": "ಅಧಿಕೃತ ಪತ್ರಲೇಖನ ನಿಯಮ ಕಲಿಯಿರಿ:",
                "concept_explanation": "💡 ನಿಯಮ: ಅಧಿಕೃತ ಪತ್ರ\nಅಧಿಕಾರಿಗಳಿಗೆ ಪತ್ರ ಬರೆಯುವಾಗ 'ಮಾನ್ಯರೇ' ಎಂದು ಆರಂಭಿಸಬೇಕು.",
                "question": "ಅಧಿಕಾರಿಗಳಿಗೆ ಬರೆಯುವ ಪತ್ರಕ್ಕೆ ಯಾವ ಶುಭಾಶಯ ಸೂಕ್ತ?",
                "options": ["ಮಾನ್ಯರೇ", "ಹೇ ಫ್ರೆಂಡ್", "ಹಲೋ ಭಾಯ್", "ಯೋ"],
                "answer": "ಮಾನ್ಯರೇ"
            }
        ]
    }
}


@router.get("/generate-exercise", response_model=GeneratedExerciseResponse)
@router.get("/ai-exercise", response_model=GeneratedExerciseResponse)
async def generate_ai_exercise(
    level: str = Query("Beginner", description="Proficiency level ('Beginner', 'Intermediate', 'Advanced')"),
    target_lang: str = Query("en", description="Target language code ('en', 'hi', 'kn', 'ta', 'te', 'mr', 'es', 'fr')")
):
    """
    Dynamically generates a multi-modal learning question using Gemini API in the target language.
    Question modalities generated:
    1. 'pictorial': Visual SVG graphic concept matching
    2. 'text_based': Grammar, vocabulary, fill-in-the-blank
    3. 'voice_based': Listen native TTS audio & repeat out loud
    4. 'reading_based': Reading passage comprehension
    5. 'learning_based': Concept preview card + understanding recall check
    """
    api_keys = get_api_keys()
    lang_code = target_lang.lower()
    fallback_lang = lang_code if lang_code in FALLBACK_EXERCISES else "en"
    fallback_pool = FALLBACK_EXERCISES.get(fallback_lang, FALLBACK_EXERCISES["en"]).get(level, FALLBACK_EXERCISES["en"]["Beginner"])

    if not api_keys:
        print("[AI EXERCISE] No Gemini API key found. Returning fallback exercise.")
        return random.choice(fallback_pool)
        
    topics = [
        "animals & wildlife", "food, fruits & vegetables", "greetings & polite expressions",
        "daily routines & habits", "vehicles & transportation", "professions & occupations",
        "family & community", "colors & nature", "weather & seasons", "home items & school supplies",
        "market & shopping", "time & days of the week", "body parts & health", "travel & places",
        "digital skills & smartphones", "workplace communication"
    ]
    chosen_topic = random.choice(topics)
    exercise_type = random.choice(["write", "text_based", "voice_based", "reading_based", "learning_based", "pictorial"])
    random_seed = random.randint(100000, 999999)

    prompt = f"""
    You are a master language teacher creating a practice question for a student learning '{lang_code}' at '{level}' proficiency level.
    Topic focus: '{chosen_topic}' (Random Seed: {random_seed}).
    Question Type to generate MUST BE: '{exercise_type}'.

    CRITICAL INSTRUCTION: ALL output string fields (instructions, questions, passages, concept explanations, options, answers, hints) MUST BE ENTIRELY WRITTEN IN THE TARGET LANGUAGE '{lang_code}'.
    If target_lang is 'hi', use authentic Hindi (Devanagari script).
    If target_lang is 'kn', use authentic Kannada script.
    If target_lang is 'ta', use Tamil script.
    If target_lang is 'te', use Telugu script.
    If target_lang is 'uz', use Uzbek latin script.
    If target_lang is 'es', use Spanish.
    If target_lang is 'fr', use French.
    If target_lang is 'en', use English.

    Formulate the JSON object based on exercise_type '{exercise_type}':

    If type == 'write':
    {{
      "type": "write",
      "instruction": "Writing Practice: Type or write your sentence in target language to enhance writing skills",
      "prompt": "Clear writing topic or sentence translation prompt in target language",
      "answer": "Expected correct written sentence in target language",
      "hint": "Writing hint or vocabulary guidance in target language",
      "min_words": 2
    }}

    If type == 'pictorial':
    {{
      "type": "pictorial",
      "instruction": "Instruction in target language (e.g., Identify the object shown in the visual illustration)",
      "question": "Question in target language",
      "svg_icon": "one of: apple, car, house, tree, book, running, writing, reading, briefcase, clock, sun, heart, school, hospital",
      "options": ["Option A in target lang", "Option B in target lang", "Option C in target lang", "Option D in target lang"],
      "answer": "Exact matching Option string",
      "hint": "Optional short hint in target language"
    }}

    If type == 'text_based':
    {{
      "type": "text_based",
      "instruction": "Instruction in target language (e.g. Fill in the blank or select correct grammar word)",
      "question": "Sentence with a blank '____' or grammar question in target language",
      "options": ["Option A in target lang", "Option B in target lang", "Option C in target lang", "Option D in target lang"],
      "answer": "Exact matching Option string",
      "hint": "Optional hint in target language"
    }}

    If type == 'voice_based':
    {{
      "type": "voice_based",
      "instruction": "Instruction in target language to listen to audio and repeat out loud",
      "text": "Sentence or phrase to speak out loud in target language",
      "audio_prompt": "Same sentence text for TTS audio playback",
      "answer": "Same sentence text"
    }}

    If type == 'reading_based':
    {{
      "type": "reading_based",
      "instruction": "Instruction in target language to read passage and answer question",
      "passage": "A 2-3 sentence short reading story/passage in target language",
      "question": "Comprehension question about the passage in target language",
      "options": ["Option A in target lang", "Option B in target lang", "Option C in target lang", "Option D in target lang"],
      "answer": "Exact matching Option string"
    }}

    If type == 'learning_based':
    {{
      "type": "learning_based",
      "instruction": "Instruction in target language to read concept card and test understanding",
      "concept_explanation": "A 2-sentence lesson/grammar rule/vocabulary tip in target language",
      "question": "Recall/understanding test question in target language",
    Return ONLY a valid JSON object matching the chosen type format above. Do not include markdown code block formatting if possible.
    """

    def _validate_exercise(raw: str):
        cleaned = raw.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        parsed = json.loads(cleaned.strip())
        if not isinstance(parsed, dict) or "type" not in parsed:
            raise ValueError("Exercise JSON is missing 'type' or not a dictionary")
        return parsed

    try:
        res_text = await call_gemini_with_key_failover(
            prompt,
            for_module_gen=False,
            timeout=15,
            validator_fn=_validate_exercise
        )
        return _validate_exercise(res_text)
    except Exception as e:
        print(f"[AI EXERCISE WARN] All Gemini models failed: {e}. Returning fallback exercise.")
        return random.choice(fallback_pool)


# Models for the Guide Book API
class GuideChapter(BaseModel):
    chapter_title: str
    content: str  # Markdown containing grammar tables, rules, practice phrases

class GuideResponse(BaseModel):
    title: str
    introduction: str
    chapters: List[GuideChapter]

@router.get("/guide", response_model=GuideResponse)
async def get_learning_guide(
    target_lang: str = Query("hi", description="Language to learn ('en', 'hi', 'kn', 'es', 'fr', 'de')"),
    native_lang: str = Query("en", description="User's native/instruction language ('en', 'hi', 'kn')")
):
    """
    Generates a full comprehensive PDF/print guide book for learning the target language in the native language.
    Utilizes local filesystem cache and Gemini API multi-model failover rotation list.
    """
    t_lang = target_lang.lower()
    n_lang = native_lang.lower()
    
    # 1. Try file cache first
    cache_filename = f"guide_{t_lang}_{n_lang}.json"
    cache_path = os.path.join(CACHE_DIR, cache_filename)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[CACHE ERROR] Failed reading guide cache: {e}")

    # 2. Key and model-rotated call to Gemini
    guide_content = None
    prompt = f"""
    You are a warm, encouraging personal language mentor and expert teacher. 
    Generate a friendly, highly engaging learning guidebook to teach the language '{t_lang}' to a student whose native language is '{n_lang}'.
    Write with a welcoming, empathetic human voice. Avoid robotic formatting, corporate jargon, or rigid AI phrasing.
    The guide must take the user comfortably from the basics (alphabets/sounds) to conversational confidence.
    
    Format the output as a JSON object with:
    - "title": A beautiful book title in '{n_lang}' (e.g. "Complete Guide to Learn Spanish: From Zero to Mastery")
    - "introduction": A warm, encouraging introduction welcoming the student.
    - "chapters": A JSON array of exactly 5 detailed chapters. Each chapter must contain:
      - "chapter_title": The name of the chapter (e.g. "Chapter 1: Alphabets & Basic Sounds")
      - "content": Extremely detailed lesson text written in '{n_lang}'. Include vocabulary lists, grammar rules, explanations, formatting with markdown tables (e.g. showing word translations), and 3 practice dialogs or sentences.

    The 5 chapters must be structured as follows:
    1. Chapter 1: Pronunciation, Characters/Alphabets, and Key Sounds of '{t_lang}'
    2. Chapter 2: Essential Greetings, Numbers, and Everyday Vocabulary
    3. Chapter 3: Basic Grammar Rules (sentence structure, pronouns, gender agreement)
    4. Chapter 4: Common Phrases for Everyday Situations (asking directions, shopping, dining)
    5. Chapter 5: Conversational Dialogs and Tips for Long-term Language Mastery

    Only respond with raw JSON matching this schema. No markdown formatting blocks around the JSON.
    """
    
    def _validate_guide(raw: str):
        cleaned = raw.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        parsed = json.loads(cleaned.strip())
        if not isinstance(parsed, dict) or "chapters" not in parsed:
            raise ValueError("Guide JSON missing 'chapters' field")
        return parsed

    try:
        res_text = await call_gemini_with_key_failover(
            prompt,
            for_module_gen=False,
            timeout=25,
            validator_fn=_validate_guide
        )
        guide_content = _validate_guide(res_text)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(guide_content, f, ensure_ascii=False, indent=2)
            print(f"[CACHE WRITE] Saved guide to file cache for {t_lang}-{n_lang}.")
        except Exception as cache_err:
            print(f"[CACHE WRITE ERROR] Failed writing guide cache: {cache_err}")
    except Exception as e:
        print(f"[API FAILOVER WARN] Failed generating guide across all models: {e}")

            
    if not guide_content:
        guide_content = {
            "title": f"Complete Guide to Learn {target_lang.upper()} from Scratch",
            "introduction": f"Welcome to the ultimate learning guide for {target_lang.upper()}! This guide is designed to take you from absolute beginner to functional communicator.",
            "chapters": [
                {
                    "chapter_title": "Chapter 1: Pronunciation & Alphabets",
                    "content": f"To master {target_lang.upper()}, start by learning the phonetic chart and characters. Practice daily."
                },
                {
                    "chapter_title": "Chapter 2: Common Greetings",
                    "content": "Vocabulary: Hello, Good morning, How are you, Thank you, Goodbye."
                },
                {
                    "chapter_title": "Chapter 3: Essential Grammar Nouns",
                    "content": "Grammar rule: Every sentence typically follows Subject-Verb-Object or Subject-Object-Verb rules depending on structural style."
                },
                {
                    "chapter_title": "Chapter 4: Asking Directions & Phrases",
                    "content": "Useful phrases: Where is the station? How much does this cost?"
                },
                {
                    "chapter_title": "Chapter 5: Conversational Practice Dialogs",
                    "content": "Dialog: 'Hello Rani, how are you?' 'I am doing well, thank you. How about you?'"
                }
            ]
        }
        
    return guide_content


