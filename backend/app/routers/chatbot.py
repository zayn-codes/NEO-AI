from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
import json
from app.key_manager import key_manager, call_gemini_with_key_failover

router = APIRouter()

class ChatbotQueryRequest(BaseModel):
    user_id: Optional[int] = None
    message: str
    target_lang: Optional[str] = "hi"
    native_lang: Optional[str] = "en"
    conversation_history: Optional[List[Dict[str, str]]] = None

class ChatbotQueryResponse(BaseModel):
    response: str
    is_language_related: bool = True
    suggested_followups: Optional[List[str]] = None

@router.post("/query", response_model=ChatbotQueryResponse)
async def handle_chatbot_query(request: ChatbotQueryRequest):
    """
    Handles user queries to the AI Language Tutor Chatbot.
    Enforces strict topic boundary: Answers language learning, grammar, translation, and literacy queries,
    and politely declines off-topic questions.
    """
    user_msg = request.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    target_lang = (request.target_lang or "hi").lower()
    native_lang = (request.native_lang or "en").lower()

    # System instruction with strict topic guardrails
    system_prompt = f"""
You are Neo AI's dedicated AI Language Tutor & Literacy Assistant.
Target Language being learned: '{target_lang}'
User's Instruction/Native Language: '{native_lang}'

STRICT GUARDRAIL & TOPIC LIMITATION:
You are ONLY allowed to answer questions related to language learning, literacy, grammar, vocabulary, translation, sentence structure, pronunciation, reading comprehension, spelling, idioms, and study guidance.

IF THE USER ASKS AN OFF-TOPIC QUESTION (such as general knowledge, programming/code, mathematics, sports, politics, entertainment news, general recipes, financial advice, etc.):
POLITELY DECLINE AND SAY:
"I am your dedicated AI Language Assistant! 🎯 I am built exclusively to help you master languages, grammar, vocabulary, translation, and pronunciation. Please ask me any language or learning-related question!"

FOR VALID LANGUAGE LEARNING QUERIES:
1. Provide a warm, helpful, encouraging response.
2. Include clear target-language examples with transliteration/pronunciation guidance and translations.
3. Keep formatting clean with bullet points or numbered steps where appropriate.

User Question: "{user_msg}"
"""

    api_keys = key_manager.get_keys()
    if not api_keys:
        # Fallback offline response logic
        return ChatbotQueryResponse(
            response=f"Hello! I am your AI Language Tutor. I am here to help you practice '{target_lang}' grammar, vocabulary, and pronunciation. Please ask any language query!",
            is_language_related=True,
            suggested_followups=[
                f"How do I greet someone in {target_lang.upper()}?",
                f"Explain basic grammar rules for {target_lang.upper()}",
                "Can you check my sentence grammar?"
            ]
        )

    try:
        # Incorporate conversation context if available
        history_context = ""
        if request.conversation_history:
            last_turns = request.conversation_history[-4:]
            history_str = "\n".join([f"{turn.get('role', 'user').capitalize()}: {turn.get('content', '')}" for turn in last_turns])
            history_context = f"\nRecent Conversation History:\n{history_str}\n"

        full_prompt = f"{system_prompt}\n{history_context}\nAnswer as AI Language Tutor:"
        ai_response = await call_gemini_with_key_failover(full_prompt, for_module_gen=False, timeout=12)
        
        # If response is returned wrapped in JSON format (e.g. {"response": "..."}), unpack it cleanly
        clean_text = ai_response.strip()
        try:
            # Strip code fences if present
            unfenced = clean_text
            if unfenced.startswith("```"):
                first_nl = unfenced.find("\n")
                if first_nl != -1:
                    unfenced = unfenced[first_nl:]
                if unfenced.endswith("```"):
                    unfenced = unfenced[:-3]
                unfenced = unfenced.strip()
            
            parsed = json.loads(unfenced)
            if isinstance(parsed, dict):
                clean_text = (
                    parsed.get("response") or 
                    parsed.get("message") or 
                    parsed.get("answer") or 
                    parsed.get("text") or 
                    parsed.get("content") or 
                    parsed.get("translation") or 
                    clean_text
                )
            elif isinstance(parsed, str):
                clean_text = parsed
        except Exception:
            pass

        # Simple heuristic check if declined
        is_lang = "I am your dedicated AI Language Assistant" not in clean_text

        # Dynamic followups
        followups = [
            f"How do I pronounce these words?",
            f"Can you give more examples?",
            f"Explain the grammar behind this",
            f"How to reply to this in a conversation?"
        ]

        return ChatbotQueryResponse(
            response=clean_text.strip(),
            is_language_related=is_lang,
            suggested_followups=followups
        )
    except Exception as e:
        print(f"[CHATBOT WARN] Failover error: {e}")
        return ChatbotQueryResponse(
            response=f"I'm currently optimizing my language models. I can still help you practice basic words or sentence rules in {target_lang.upper()}!",
            is_language_related=True,
            suggested_followups=[
                f"How to say 'Thank you' in {target_lang.upper()}?",
                f"Explain basic grammar rules for {target_lang.upper()}",
                "Can you check my sentence grammar?"
            ]
        )
