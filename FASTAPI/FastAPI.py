from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
import requests
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
import google.generativeai as genai
import nltk
import re

load_dotenv()

Gemini_API_KEY = "AIzaSyBi0dvebVigXIIpCZoukGCswaD6_xjO-oA"
genai.configure(api_key=Gemini_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')


app = FastAPI(title="Medical Semantic Fact Checker & Summarizer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Load BioBERT ----------
biobert_model_name = "dmis-lab/biobert-base-cased-v1.1"
tokenizer = AutoTokenizer.from_pretrained(biobert_model_name, use_fast=False)
biobert_model = AutoModel.from_pretrained(biobert_model_name)


# ---------- API Key for Google Fact Check API ----------
api_key = "AIzaSyAfd1Gtn8wfaKUC0R9f-X117H4lHNIBBJM"

# ---------- Input Schemas ----------
class ClaimRequest(BaseModel):
    text: str  


def get_truth_sources(data):
    claims = query_fact_check_api(data)
    true_claims = []
    for item in claims:
        review = item.get("claimReview", [{}])[0]
        claim_text = item.get("text", "")
        score = get_similarity(data, claim_text)
        if score > 0.7:
            true_claims.append({
                "title": review.get("title"),
                "url": review.get("url"),
                #"publisher": review.get("publisher", {}).get("name", ""),
                #"similarity_score": round(score, 3)
                })

    if not true_claims:
        prompt = f"""
        Is the following statement true or false? Please include list of 2-3 sources or references (with links) that support your answer.

        Statement: "{data}"

        Format:
        - Verdict: True or False
        - Sources: [Title](Link)
        """
        response = model.generate_content(prompt)
        pattern = r"\*([^*]+)\*:\s*\[([^\]]+)\]"
        matches = re.findall(pattern, response)
        return [{"title": title.strip(), "url": url.strip()} for title, url in matches]

    return true_claims 
    

    
def fact_retriver_fallback(text1):
    prompt = f"Is the following statement true or false? Just respond with 'True' or 'False':\n\n{text1}"
    response = model.generate_content(prompt)
    result = response.text.strip().lower()

    if "true" in result:
        return "True"
    elif "false" in result:
        return "False"
    else:
        return "Uncertain"
    
    return ''


def summariser1(text1):
    word_count = len(text1.strip().split())

    # If short (e.g., under 30 words), return as-is
    if word_count <= 30:
        return text1.strip()

    prompt = f"""
    Summarize the following text in **no more than 30 words**:

    \"\"\"{text1}\"\"\"

    SUMMARY:
    """
    response = model.generate_content(prompt)
    return response.text.strip()



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
        verdict_text = review.get("textualRating", "").lower()

        sim_to_true = get_similarity(verdict_text, "true")
        sim_to_false = get_similarity(verdict_text, "false")
        final_verdict = "True" if sim_to_true > sim_to_false else "False"

        return {
            #"input_claim": user_claim,
            #"matched_claim": best_match.get("text", ""),
            #"similarity_score": round(best_match["similarity_score"], 3),
            "final_verdict": final_verdict
        }
    else:
        #verdicts=[]
        #summary = summariser1(user_claim.text)
        #sentences=nltk.sent_tokenize(summary)
        #for i in sentences:
        #    verdict=get_best_match(i)
        #    verdicts.append(verdict)
        #return {"sentence":sentences,"verdict":verdicts}
        fact3 = fact_retriver_fallback(user_claim)
        return {'final_verdict': fact3}


    return {"messag": "No relevant fact-checks found."}

# ---------- Endpoint: /fact-check ----------
@app.post("/fact-check")
def fact_check(data: ClaimRequest):
    verdict=get_best_match(data.text)
    if verdict['final_verdict']== 'False':
        claims=get_truth_sources(data.text)

        return {'verdict':verdict['final_verdict'],'source':claims}
    return {'verdict':verdict['final_verdict']}
    
@app.post("/summarize")
def summarize_text(data: ClaimRequest):
    try:
        summary = summariser1(data.text)
        return {"summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/glossary")
async def glossary_lookup(data: ClaimRequest):
    term = data.text.strip()

    prompt = f"Explain the medical term '{term}' in one short sentence."

    try:
        response = model.generate_content(
            contents=[
                {
                    "parts": [{"text": prompt}]
                }
            ]
        )
        return {"term": term, "definition": response.text.strip()}

    except Exception as e:
        return {"error": str(e)}
