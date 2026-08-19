import time
import os
import json
import urllib.request
import urllib.error
import asyncio
from typing import List, Dict, Any, Optional
from app.config import settings

class APIKeyManager:
    """
    Manages rotation, tracking, and failover for Gemini API keys.
    When a key hits rate limits or quota limits (e.g. HTTP 429), it is marked
    as exhausted so subsequent requests automatically start with the next working key.
    """
    def __init__(self):
        self._exhausted_keys: Dict[str, float] = {}  # api_key -> cooldown_expiration_timestamp
        self._current_index: int = 0
        self._cooldown_seconds: float = 300.0  # 5 minutes cooldown for rate-limited keys

    def get_keys(self, for_module_gen: bool = False, for_study_guide: bool = False, for_voice_assistant: bool = False) -> List[str]:
        raw_keys: List[str] = []

        # 1. Dedicated Study Guide Keys (if generating study guide)
        if for_study_guide:
            sg_key = (
                getattr(settings, "STUDY_GUIDE_API_KEY", None) or os.getenv("STUDY_GUIDE_API_KEY") or
                getattr(settings, "STUDY_GUIDE_KEY", None) or os.getenv("STUDY_GUIDE_KEY")
            )
            if sg_key:
                for k in sg_key.split(","):
                    clean = k.strip()
                    if clean and clean not in raw_keys:
                        raw_keys.append(clean)

        # 2. Primary Gemini API Key & Gemini API Keys
        single_key = getattr(settings, "GEMINI_API_KEY", None) or os.getenv("GEMINI_API_KEY")
        if single_key and single_key.strip() and single_key.strip() not in raw_keys:
            raw_keys.append(single_key.strip())

        keys_str = getattr(settings, "GEMINI_API_KEYS", None) or os.getenv("GEMINI_API_KEYS")
        if keys_str:
            for k in keys_str.split(","):
                clean = k.strip()
                if clean and clean not in raw_keys:
                    raw_keys.append(clean)

        # 3. Module Generation Keys
        mod_key = (
            getattr(settings, "MODULE_GEN_KEY", None) or os.getenv("MODULE_GEN_KEY") or
            getattr(settings, "MODULE_GENERATION_KEY", None) or os.getenv("MODULE_GENERATION_KEY") or
            getattr(settings, "MODULE_GEN_API_KEY", None) or os.getenv("MODULE_GEN_API_KEY")
        )
        if mod_key:
            for k in mod_key.split(","):
                clean = k.strip()
                if clean and clean not in raw_keys:
                    raw_keys.append(clean)

        # 4. Voice Assistant Keys
        if for_voice_assistant:
            va_key = (
                getattr(settings, "VOICE_ASSISTANT_API_KEY", None) or os.getenv("VOICE_ASSISTANT_API_KEY") or
                getattr(settings, "VOICE_ASSISTANT_KEY", None) or os.getenv("VOICE_ASSISTANT_KEY")
            )
            if va_key:
                for k in va_key.split(","):
                    clean = k.strip()
                    if clean and clean not in raw_keys:
                        raw_keys.append(clean)

        # 5. AI Practice Keys
        ai_practice_key = getattr(settings, "AI_PRACTICE_KEY", None) or os.getenv("AI_PRACTICE_KEY") or getattr(settings, "AI_PRACTICE", None) or os.getenv("AI_PRACTICE")
        if ai_practice_key:
            for k in ai_practice_key.split(","):
                clean = k.strip()
                if clean and clean not in raw_keys:
                    raw_keys.append(clean)

        if not raw_keys:
            return []

        now = time.time()
        # Filter out expired cooldowns
        self._exhausted_keys = {k: exp for k, exp in self._exhausted_keys.items() if exp > now}

        # Select non-exhausted keys
        active_keys = [k for k in raw_keys if k not in self._exhausted_keys]
        if not active_keys:
            # If all keys are in cooldown, reset cooldowns to allow retry
            print("[KEY MANAGER WARNING] All API keys in cooldown! Resetting cooldown filters to retry.")
            self._exhausted_keys.clear()
            active_keys = raw_keys

        start_idx = self._current_index % len(active_keys)
        ordered = active_keys[start_idx:] + active_keys[:start_idx]
        return ordered

    def is_rate_limit_error(self, err: Exception) -> bool:
        err_str = str(err).lower()
        if isinstance(err, urllib.error.HTTPError):
            if err.code == 429:
                return True
        if "429" in err_str or "quota" in err_str or "rate limit" in err_str or "resource_exhausted" in err_str or "too many requests" in err_str:
            return True
        return False

    def mark_key_exhausted(self, api_key: str, reason: str = "Quota/Rate Limit Exceeded"):
        now = time.time()
        self._exhausted_keys[api_key] = now + self._cooldown_seconds
        self._current_index += 1
        masked = f"...{api_key[-6:]}" if len(api_key) >= 6 else api_key
        print(f"[KEY MANAGER] API Key {masked} hit limit ({reason}). Switching to next key for current & future requests.")

key_manager = APIKeyManager()

async def call_gemini_with_key_failover(
    prompt: str,
    for_module_gen: bool = False,
    for_study_guide: bool = False,
    for_voice_assistant: bool = False,
    for_registration_quiz: bool = False,
    timeout: int = 25,
    models: Optional[List[str]] = None,
    validator_fn: Optional[Any] = None
) -> str:
    """
    Executes a Gemini API request with continuous multi-model and multi-key failover.
    If any model fails (404, 429 quota, 500/503 server overloaded, timeout, malformed JSON,
    or schema validation failure), the system immediately switches to the next model in the priority list
    until the generation request is completely fulfilled and achieved.
    """
    if models is None:
        # Check cache locations for optimized verified model list
        priority_paths = [
            os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cache", "optimized_model_priority.json"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache", "optimized_model_priority.json")
        ]
        for p_path in priority_paths:
            if os.path.exists(p_path):
                try:
                    with open(p_path, "r", encoding="utf-8") as f:
                        cache_data = json.load(f)
                        cached_models = cache_data.get("module_generation_priority", [])
                        if cached_models:
                            models = cached_models
                            break
                except Exception as e:
                    print(f"[KEY MANAGER WARN] Could not read model priority cache: {e}")

        if not models:
            # Verified active Google Gemini models ranked by latency
            models = [
                "gemini-flash-lite-latest",
                "gemini-3.5-flash-lite",
                "gemini-robotics-er-1.6-preview",
                "gemma-4-26b-a4b-it",
                "gemini-3-flash-preview",
                "gemini-3.1-flash-lite-preview",
                "gemini-3.1-flash-lite"
            ]

    api_keys = key_manager.get_keys(
        for_module_gen=for_module_gen,
        for_study_guide=for_study_guide,
        for_voice_assistant=for_voice_assistant
    )

    if not api_keys:
        raise RuntimeError("No Gemini API keys configured.")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }
    encoded_payload = json.dumps(payload).encode("utf-8")

    last_exception = None
    attempt_count = 0

    # Iterate through models: if one model fails, switch to another until achieved
    for m_idx, model in enumerate(models):
        next_model = models[m_idx + 1] if m_idx + 1 < len(models) else "local fallback"

        for k_idx, api_key in enumerate(api_keys):
            masked = f"...{api_key[-6:]}" if len(api_key) >= 6 else api_key
            attempt_count += 1
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

            def _http_post():
                req = urllib.request.Request(
                    url,
                    data=encoded_payload,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return resp.read().decode("utf-8")

            try:
                response_text = await asyncio.to_thread(_http_post)
                data = json.loads(response_text)
                inner_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()

                if inner_text.startswith("```json"):
                    inner_text = inner_text[7:]
                elif inner_text.startswith("```"):
                    inner_text = inner_text[3:]
                if inner_text.endswith("```"):
                    inner_text = inner_text[:-3]
                inner_text = inner_text.strip()

                if not inner_text or len(inner_text) < 10:
                    raise ValueError(f"Model '{model}' returned empty or truncated response")

                # If custom validator provided, ensure output fulfills all requirements
                if validator_fn is not None:
                    try:
                        validated_result = validator_fn(inner_text)
                        if validated_result is False:
                            raise ValueError(f"Model '{model}' output failed semantic validation requirements")
                    except Exception as val_err:
                        raise ValueError(f"Model '{model}' output failed validation: {val_err}")

                print(f"[MODEL SUCCESS] Generation achieved using model '{model}' with key {masked} on attempt #{attempt_count}!")
                return inner_text

            except Exception as e:
                last_exception = e
                err_msg = str(e)
                if key_manager.is_rate_limit_error(e):
                    key_manager.mark_key_exhausted(api_key, f"Rate limit on model {model}")
                    print(f"[MODEL FAILOVER] Rate limit for model '{model}' on key {masked}. Switching to next key/model...")
                else:
                    print(f"[MODEL FAILOVER] Model '{model}' failed on key {masked} ({err_msg[:90]}...). Switching to next model '{next_model}'...")

    raise RuntimeError(f"All {len(models)} models and keys exhausted for generation: {last_exception}")
