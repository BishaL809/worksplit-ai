import os
import re
import joblib
from typing import Dict, Any

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'model', 'expense_model.pkl')
VECTORIZER_PATH = os.path.join(BASE_DIR, 'model', 'vectorizer.pkl')

model = None
vectorizer = None

CATEGORY_KEYWORDS = {
    'Food': ['dinner', 'lunch', 'breakfast', 'restaurant', 'pizza', 'burger', 'cafe', 'coffee', 'groceries', 'food', 'meal', 'swiggy', 'zomato', 'bakery', 'snacks'],
    'Transportation': ['uber', 'cab', 'ride', 'taxi', 'metro', 'bus', 'train', 'flight', 'petrol', 'diesel', 'fuel', 'toll', 'parking', 'auto'],
    'Work': ['tools', 'work', 'safety', 'helmet', 'helmets', 'gloves', 'drill', 'toolbox', 'screwdrivers', 'stationery', 'office', 'equipment', 'ladder', 'welding', 'paper'],
    'Bills': ['bill', 'electricity', 'power', 'water', 'wifi', 'broadband', 'internet', 'rent', 'recharge', 'utility', 'postpaid', 'gas'],
    'Entertainment': ['netflix', 'movie', 'cinema', 'tickets', 'spotify', 'game', 'concert', 'amusement', 'youtube', 'prime', 'show', 'theater'],
    'Healthcare': ['medicine', 'pharmacy', 'doctor', 'clinic', 'consultation', 'dental', 'hospital', 'pills', 'tablets', 'health', 'syrup'],
    'Education': ['books', 'college', 'tuition', 'course', 'exam', 'textbooks', 'notebooks', 'calculator', 'school', 'university', 'study'],
    'Shopping': ['shoes', 'clothes', 'amazon', 'flipkart', 'jacket', 'shirt', 'jeans', 'sneakers', 'watch', 'shopping', 'dress', 'sunglasses'],
    'Other': ['donation', 'charity', 'courier', 'fee', 'locksmith', 'laundry', 'maintenance', 'atm']
}

def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r'[^a-z\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def ensure_model_loaded():
    global model, vectorizer
    if model is None or vectorizer is None:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(VECTORIZER_PATH):
            print("Model files not found. Auto-triggering model training...")
            import train_model
            train_model.train_and_save()
        vectorizer = joblib.load(VECTORIZER_PATH)
        model = joblib.load(MODEL_PATH)

def predict_category(description: str) -> Dict[str, Any]:
    ensure_model_loaded()
    cleaned = clean_text(description)
    if not cleaned:
        return {'category': 'Other', 'confidence': 0.50, 'confidence_percent': 50.0}

    features = vectorizer.transform([cleaned])
    pred_category = model.predict(features)[0]
    probs = model.predict_proba(features)[0]
    confidence = float(max(probs))

    return {
        'category': pred_category,
        'confidence': round(confidence, 2),
        'confidence_percent': round(confidence * 100, 1)
    }

def explain_prediction(description: str, category: str = None) -> Dict[str, str]:
    """Generates an intuitive local explanation for why this category was predicted."""
    if not category:
        prediction = predict_category(description)
        category = prediction['category']

    cleaned = clean_text(description)
    tokens = set(cleaned.split())

    keywords = CATEGORY_KEYWORDS.get(category, [])
    matched_words = [w for w in tokens if w in keywords]

    if matched_words:
        matched_str = ", ".join(f"'{w}'" for w in matched_words)
        explanation = (
            f"The AI chose '{category}' because your description has words like {matched_str}, "
            f"which are typically for {category.lower()} expenses."
        )
    else:
        explanation = (
            f"The AI chose '{category}' because your description matches patterns commonly found in {category.lower()} expenses."
        )

    return {
        'expense': description,
        'category': category,
        'explanation': explanation
    }
