import os
import sys
import time
import json
import urllib.request
import urllib.error
from typing import List, Dict, Any

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.config import settings

def load_api_keys() -> List[str]:
    """Extract all distinct API keys configured in environment and settings."""
    keys = []
    # 1. Primary keys
    for k_attr in ["GEMINI_API_KEY", "MODULE_GEN_KEY", "MODULE_GENERATION_KEY", "STUDY_GUIDE_KEY", "STUDY_GUIDE_API_KEY", "VOICE_ASSISTANT_KEY", "VOICE_ASSISTANT_API_KEY", "AI_PRACTICE_KEY"]:
        val = getattr(settings, k_attr, None) or os.getenv(k_attr)
        if val and val.strip():
            for item in val.split(","):
                clean = item.strip()
                if clean and clean not in keys:
                    keys.append(clean)
                    
    # 2. Comma separated list
    keys_str = getattr(settings, "GEMINI_API_KEYS", None) or os.getenv("GEMINI_API_KEYS")
    if keys_str:
        for k in keys_str.split(","):
            clean = k.strip()
            if clean and clean not in keys:
                keys.append(clean)
                
    return keys

def fetch_available_models(api_key: str) -> List[str]:
    """Query Google API for all registered models supporting generateContent."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"}, method="GET")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models_list = []
            for m in data.get("models", []):
                name = m.get("name", "")
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods and "models/" in name:
                    clean_name = name.replace("models/", "")
                    models_list.append(clean_name)
            return models_list
    except Exception as e:
        print(f"[WARN] Failed to fetch model list from Google API: {e}")
        return []

def test_model_generation(model_name: str, api_key: str) -> Dict[str, Any]:
    """Test text generation with a specific Gemini model."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "Reply with only the word 'WORKING'."}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 20}
    }
    encoded_payload = json.dumps(payload).encode("utf-8")
    
    start_time = time.time()
    try:
        req = urllib.request.Request(
            url,
            data=encoded_payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            duration = round(time.time() - start_time, 3)
            res_data = json.loads(resp.read().decode("utf-8"))
            text = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            return {
                "model": model_name,
                "status": "SUCCESS",
                "latency_sec": duration,
                "response": text,
                "error": None
            }
    except urllib.error.HTTPError as he:
        duration = round(time.time() - start_time, 3)
        err_msg = f"HTTP {he.code}: {he.reason}"
        return {
            "model": model_name,
            "status": "FAILED",
            "latency_sec": duration,
            "response": None,
            "error": err_msg
        }
    except Exception as e:
        duration = round(time.time() - start_time, 3)
        return {
            "model": model_name,
            "status": "FAILED",
            "latency_sec": duration,
            "response": None,
            "error": str(e)
        }

def main():
    print("=" * 80)
    print(" [*] GEMINI MODELS DIAGNOSTIC & VERIFICATION SUITE")
    print("=" * 80)
    
    api_keys = load_api_keys()
    if not api_keys:
        print("[ERROR] No Gemini API keys found in settings or environment!")
        return
        
    print(f"[INFO] Loaded {len(api_keys)} unique API Key(s).")
    test_key = api_keys[0]
    masked_key = f"...{test_key[-6:]}"
    print(f"[INFO] Querying Google API with key {masked_key} to discover available models...")
    
    discovered_models = fetch_available_models(test_key)
    
    standard_candidates = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite-preview-02-05",
        "gemini-2.0-flash-lite",
        "gemini-2.0-pro-exp-02-05",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-1.5-pro",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro-latest"
    ]
    
    all_models_to_test = list(dict.fromkeys(discovered_models + standard_candidates))
    print(f"[INFO] Found {len(all_models_to_test)} total models to test for text generation.\n")
    
    results = []
    working_models = []
    
    for i, model in enumerate(all_models_to_test, 1):
        print(f"[{i:02d}/{len(all_models_to_test):02d}] Testing '{model}'...", end=" ", flush=True)
        res = test_model_generation(model, test_key)
        results.append(res)
        
        if res["status"] == "SUCCESS":
            print(f"[OK] SUCCESS ({res['latency_sec']}s) -> \"{res['response']}\"")
            working_models.append(model)
        else:
            print(f"[X] FAILED ({res['error']})")

    print("\n" + "=" * 80)
    print(f" [SUMMARY] {len(working_models)}/{len(all_models_to_test)} Models Verified Working")
    print("=" * 80)
    
    working_results = [r for r in results if r["status"] == "SUCCESS"]
    working_results.sort(key=lambda x: x["latency_sec"])
    
    print("\n[RANKED WORKING MODELS (Fastest to Slowest)]:")
    print(f"{'Rank':<6} {'Model Name':<42} {'Latency (s)':<15} {'Status'}")
    print("-" * 75)
    for rank, item in enumerate(working_results, 1):
        print(f"#{rank:<5} {item['model']:<42} {item['latency_sec']:<15} [ACTIVE]")
        
    sorted_working_models = [r["model"] for r in working_results]
    
    # Save optimized model list to cache
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, "optimized_model_priority.json")
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump({
            "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "module_generation_priority": sorted_working_models,
            "all_verified_models": sorted_working_models
        }, f, indent=2)
        
    print(f"\n[INFO] Saved verified model list to '{cache_file}'")
    print(f"\nRecommended Python Model List for key_manager.py:")
    print("models = [")
    for m in sorted_working_models:
        print(f'    "{m}",')
    print("]\n")

if __name__ == "__main__":
    main()
