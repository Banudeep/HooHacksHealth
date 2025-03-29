from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
import requests
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel, pipeline
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Medical Semantic Fact Checker & Summarizer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or use ["chrome-extension://<your-extension-id>"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Load BioBERT ----------
biobert_model_name = "dmis-lab/biobert-base-cased-v1.1"
tokenizer = AutoTokenizer.from_pretrained(biobert_model_name)
biobert_model = AutoModel.from_pretrained(biobert_model_name)

# ---------- Load BART Summarizer ----------
summarizer = pipeline("summarization", model="facebook/bart-large-cnn")

# ---------- API Key for Google Fact Check API ----------
api_key = "AIzaSyAfd1Gtn8wfaKUC0R9f-X117H4lHNIBBJM"

# ---------- Input Schemas ----------
class ClaimRequest(BaseModel):
    text: str  # Used for both summarization and fact-checking

# ---------- Mean Pooling for Sentence Embeddings ----------
def mean_pooling(token_embeddings, attention_mask):
    input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size())
    return torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)

# ---------- Semantic Similarity ----------
def get_similarity(text1, text2):
    inputs = tokenizer([text1, text2], return_tensors="pt", padding=True, truncation=True)
    with torch.no_grad():
        outputs = biobert_model(**inputs)
    embeddings = mean_pooling(outputs.last_hidden_state, inputs["attention_mask"])
    return F.cosine_similarity(embeddings[0].unsqueeze(0), embeddings[1].unsqueeze(0)).item()

# ---------- Query Google Fact Check API ----------
def query_fact_check_api(claim):
    url = f"https://factchecktools.googleapis.com/v1alpha1/claims:search?query={claim}&key={api_key}"
    response = requests.get(url)
    if response.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to fetch data from Fact Check API.")
    return response.json().get("claims", [])

# ---------- Best Match from Fact Check API ----------
def get_best_match(user_claim):
    claims = query_fact_check_api(user_claim)

    best_score = -1
    best_match = None

    for item in claims:
        claim_text = item.get("text", "")
        if not claim_text:
            continue

        score = get_similarity(user_claim, claim_text)
        if score > best_score:
            best_score = score
            best_match = item
            best_match["similarity_score"] = score

    if best_match:
        review = best_match.get("claimReview", [{}])[0]
        review_rating = review.get("reviewRating", {})

        return {
            "input_claim": user_claim,
            "matched_claim": best_match.get("text", ""),
            "similarity_score": round(best_match["similarity_score"], 3),
            "verdict_text": review.get("textualRating", "Unknown"),
            "rating_value": review_rating.get("ratingValue", "N/A"),
            "best_rating": review_rating.get("bestRating", "N/A"),
            "worst_rating": review_rating.get("worstRating", "N/A"),
            "alternate_name": review_rating.get("alternateName", "N/A"),
            "review_title": review.get("title", "N/A"),
            "review_date": review.get("reviewDate", "N/A"),
            "publisher": review.get("publisher", {}).get("name", "Unknown"),
            "url": review.get("url", "")
        }

    return {"message": "No relevant fact-checks found."}

# ---------- Summarization Logic ----------
def summarize_abstractive(text: str) -> str:
    input_len = len(text.split())
    max_len = min(120, int(input_len * 0.7))
    min_len = max(20, int(input_len * 0.3))
    summary = summarizer(text, max_length=max_len, min_length=min_len, do_sample=False)
    return summary[0]['summary_text']

# ---------- Endpoint: /fact-check ----------
@app.post("/fact-check")
def fact_check(data: ClaimRequest):
    return get_best_match(data.text)

@app.post("/summarize")
def summarize_text(data: ClaimRequest):
    try:
        summary = summarize_abstractive(data.text)
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/truth_sources")
def get_truth_sources(data: ClaimRequest):
    user_claim = data.text
    claims = query_fact_check_api(user_claim)
    true_claims = []

    for item in claims:
        review = item.get("claimReview", [{}])[0]
        verdict = review.get("textualRating", "").lower()

        if "false" in verdict:  # Matches "True", "Mostly True"
            claim_text = item.get("text", "")
            score = get_similarity(user_claim, claim_text)
            if score > 0.7:
                true_claims.append({
                    "title": review.get("title"),
                    "url": review.get("url"),
                    "publisher": review.get("publisher", {}).get("name", ""),
                    "similarity_score": round(score, 3)
                })

    if not true_claims:
        return {"message": "No verified true sources found."}

    return {"verified_sources": sorted(true_claims, key=lambda x: -x["similarity_score"])[:3]}

