import os
import re
import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

def clean_text(text: str) -> str:
    """
    Cleans raw expense description text by:
    - Lowercasing
    - Removing special characters & numbers
    - Collapsing multiple whitespace into single space
    """
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r'[^a-z\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def train_and_save():
    print("==================================================")
    print("         TRAINING WORKSPLIT AI NLP MODEL          ")
    print("==================================================")

    dataset_path = os.path.join(os.path.dirname(__file__), 'dataset', 'expenses.csv')
    model_dir = os.path.join(os.path.dirname(__file__), 'model')
    os.makedirs(model_dir, exist_ok=True)

    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Dataset not found at {dataset_path}")

    # Load dataset
    df = pd.read_csv(dataset_path)
    print(f"Loaded {len(df)} samples across {df['category'].nunique()} categories.")
    print("Category breakdown:\n", df['category'].value_counts())

    # Clean text descriptions
    df['cleaned_description'] = df['description'].apply(clean_text)

    X = df['cleaned_description']
    y = df['category']

    # Train/Test Evaluation Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    eval_vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        stop_words='english',
        sublinear_tf=True
    )
    X_train_vec = eval_vectorizer.fit_transform(X_train)
    X_test_vec = eval_vectorizer.transform(X_test)

    eval_model = MultinomialNB(alpha=0.1)
    eval_model.fit(X_train_vec, y_train)

    y_pred = eval_model.predict(X_test_vec)
    accuracy = accuracy_score(y_test, y_pred)
    print(f"\nModel Evaluation on 20% Test Split:")
    print(f"Test Accuracy: {accuracy * 100:.2f}%")
    print("\nClassification Report:\n", classification_report(y_test, y_pred, zero_division=0))

    # Train Final Production Model on 100% of samples
    print("Training final production model on all samples...")
    final_vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        stop_words='english',
        sublinear_tf=True
    )
    X_full_vec = final_vectorizer.fit_transform(X)

    final_model = MultinomialNB(alpha=0.1)
    final_model.fit(X_full_vec, y)

    vectorizer_file = os.path.join(model_dir, 'vectorizer.pkl')
    model_file = os.path.join(model_dir, 'expense_model.pkl')

    joblib.dump(final_vectorizer, vectorizer_file)
    joblib.dump(final_model, model_file)
    print(f"Saved vectorizer to: {vectorizer_file}")
    print(f"Saved model to:      {model_file}")

    print("\nSanity Check Verification:")
    test_cases = [
        "Dinner at restaurant",
        "Pizza and burger",
        "Uber ride to work",
        "Uber ride",
        "Bought tools for work",
        "Netflix subscription",
        "Electricity bill",
        "Bought new shoes",
        "Bought medicine",
        "College books"
    ]

    for item in test_cases:
        cleaned = clean_text(item)
        vec = final_vectorizer.transform([cleaned])
        pred_cat = final_model.predict(vec)[0]
        probs = final_model.predict_proba(vec)[0]
        confidence = float(max(probs))
        print(f"  '{item}' -> {pred_cat} (Confidence: {confidence * 100:.1f}%)")

    print("\nTraining completed successfully!\n")

if __name__ == '__main__':
    train_and_save()
