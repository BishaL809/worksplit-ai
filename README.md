# WorkSplit AI & Personal Expense Tracker
> **AI-Powered Personal Budget Tracker & Group Expense Settlement System**

A modern, offline-capable web application combining **Personal Expense & Budget Tracking**, **deterministic group payment & expense settlement**, and **local NLP expense classification and explanation**.

---

## 1. Project Title & Overview
**WorkSplit AI** is an all-in-one financial tracker featuring two integrated modes:

### A. Personal Expense & Budget Tracker
- **Income & Expense Logging**: Record daily expenses and income streams with date, payment method (UPI, Credit Card, Debit Card, Net Banking, Cash), and notes.
- **Real-Time AI Auto-Categorization**: Machine learning auto-detects categories (Food, Transportation, Bills, Shopping, Healthcare, etc.) as you type.
- **Monthly Budget Monitoring**: Set a target monthly budget; the system tracks remaining funds and alerts you if spending exceeds limits.
- **Visual Analytics**: Interactive Chart.js charts for category spending breakdown (Doughnut) and daily spending trends (Bar chart).
- **Data Export**: 1-click CSV export of monthly or historical personal transactions.

### B. Group Payment & Expense Settlement System
Designed for real-world scenarios where a group works together, receives client payments, and shares expenses:
- Who earned how much?
- Who physically received the money?
- Who paid for shared expenses?
- What is each member's net balance?
- Who should pay whom to settle all debts with the fewest transactions?

---

## 2. Key Mathematical Rule: Financial Math vs. Local AI
> [!IMPORTANT]
> **NO AI is used for financial calculations.**
> Financial calculations are 100% deterministic, mathematically auditable, and based on strict accounting rules.
> 
> The **AI / Machine Learning component** is exclusively responsible for:
> 1. Natural Language Processing (NLP) of expense descriptions
> 2. Classifying text into 9 categories
> 3. Generating confidence scores
> 4. Explaining category predictions locally without external APIs

---

## 3. Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript | Responsive layout, light theme with primary blue accent |
| **Charts** | Chart.js (Bundled locally) | Doughnut chart for categories, Bar chart for member net balances |
| **Backend** | Python 3, Flask | Modular REST API and page routing |
| **Database** | SQLite3 | Relational database (`database/worksplit.db`) with foreign keys & parameterized queries |
| **Machine Learning** | scikit-learn, joblib, pandas | TF-IDF Vectorizer + Multinomial Naive Bayes classifier (100% offline) |

---

## 4. Main Expense Categories (9 Categories)
1. **Food** (e.g., dinner at restaurant, pizza, groceries, cafe)
2. **Transportation** (e.g., uber, cab, petrol, metro, toll)
3. **Work** *(New)* (e.g., bought tools for work, safety helmets, drill machine, office stationery)
4. **Shopping** (e.g., shoes, clothes, jacket, electronics)
5. **Bills** (e.g., electricity bill, wifi, water, rent, mobile recharge)
6. **Entertainment** (e.g., netflix, movie tickets, spotify, games)
7. **Healthcare** (e.g., medicine, doctor, clinic, dental)
8. **Education** (e.g., college books, courses, exam fee, tuition)
9. **Other** (custom items with sub-item description, e.g., Other (Donation))

---

## 5. Settlement Calculation Methodology

### The Deterministic Net Balance Equation
For every member $i$:
$$\text{Net Balance}_i = (\text{Total Earned}_i - \text{Physically Received}_i) + (\text{Personally Paid}_i - \text{Expense Share}_i) + (\text{Settlements Paid}_i - \text{Settlements Received}_i)$$

- **Positive Balance ($> 0$)**: The member is a creditor &rarr; **Should Receive money**.
- **Negative Balance ($< 0$)**: The member is a debtor &rarr; **Needs to Pay money**.
- **Zero ($0.00$)**: The member is completely settled.
- **Zero-Sum Invariant**: At all times, the sum of all members' net balances is **identically 0.00**:
  $$\sum_{i} \text{Net Balance}_i = 0.00$$

### Min-Cash-Flow Settlement Engine (Who Pays Whom)
To avoid unnecessary circular transactions (e.g., $A$ pays $B$ while $B$ pays $C$), WorkSplit AI runs a greedy min-cash-flow algorithm:
1. Divide members into **Debtors** ($\text{Net} < 0$) and **Creditors** ($\text{Net} > 0$).
2. Sort both lists by absolute magnitude descending.
3. Iteratively match the largest debtor with the largest creditor:
   $$\text{Transfer Amount} = \min(|\text{Debtor Balance}|, \text{Creditor Balance})$$
4. Decrement both balances and record the transaction:
   $$\text{Debtor} \xrightarrow{\text{Transfer Amount}} \text{Creditor}$$
5. Repeats until all debts are fully cleared in minimal transfers.

---

## 6. Example Test Scenario Walkthrough (Section 29)

### Setup:
- **Group**: Bishal, Rahul, Aman, Rohit
- **Work Payment**: ₹2,000 received by Rahul, shared equally (₹500 each).
- **Expense 1**: "Dinner at restaurant" ₹600 paid by Rahul, shared equally (₹150 each) &rarr; AI Category: **Food**.
- **Expense 2**: "Uber ride" ₹400 paid by Aman, shared equally (₹100 each) &rarr; AI Category: **Transportation**.

### Step-by-Step Balance Calculation:
| Member | Total Earned | Physically Received | Personally Paid | Expense Share | Net Balance | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Bishal** | ₹500 | ₹0 | ₹0 | ₹250 (150+100) | **+₹250.00** | Should Receive |
| **Rahul** | ₹500 | ₹2,000 | ₹600 | ₹250 (150+100) | **-₹1,150.00** | Needs to Pay |
| **Aman** | ₹500 | ₹0 | ₹400 | ₹250 (150+100) | **+₹650.00** | Should Receive |
| **Rohit** | ₹500 | ₹0 | ₹0 | ₹250 (150+100) | **+₹250.00** | Should Receive |
| **SUM** | ₹2,000 | ₹2,000 | ₹1,000 | ₹1,000 | **₹0.00** | *Balanced* |

### Generated Who-Pays-Whom Settlement:
1. **Rahul &rarr; Aman**: **₹650.00**
2. **Rahul &rarr; Bishal**: **₹250.00**
3. **Rahul &rarr; Rohit**: **₹250.00**

Total paid by Rahul = ₹650 + ₹250 + ₹250 = **₹1,150.00**. All debts are cleared in just 3 transactions!

---

## 7. System Architecture & Project Structure

```
WorkSplit_AI/
│
├── app.py                      # Flask routes (Views & REST API)
├── train_model.py              # 9-category TF-IDF + Naive Bayes training script
├── test_app.py                 # Automated unit and integration test suite
├── requirements.txt            # Python dependencies (Flask, scikit-learn, pandas, joblib)
├── README.md                   # System documentation & Viva Q&A guide
│
├── dataset/
│   └── expenses.csv            # 410+ labeled training descriptions
│
├── model/
│   ├── expense_model.pkl       # Trained MultinomialNB model
│   └── vectorizer.pkl          # Fitted TF-IDF Vectorizer
│
├── database/
│   └── worksplit.db            # SQLite relational database
│
├── services/
│   ├── database_service.py     # SQLite schema, queries, cascade deletes, and seed scenario
│   ├── settlement_service.py   # Deterministic financial calculations & min-cash-flow algorithm
│   └── ai_service.py           # NLP inference & local category explanation generator
│
├── templates/
│   ├── base.html               # Navigation bar, active group selector, and toast notifications
│   ├── dashboard.html          # KPI cards, member balance cards, and Chart.js graphs
│   ├── groups.html             # Group & member management
│   ├── payments.html           # Work payment earnings and multi-split methods
│   ├── expenses.html           # Add expense with AI prediction, explanation, and manual override
│   ├── balances.html           # Detailed individual member balance audit table
│   ├── settlement.html         # Visual Who-Pays-Whom flow cards & transfer recording
│   └── history.html            # Unified transaction history with search & multi-filter
│
└── static/
    ├── css/style.css           # Clean modern light theme with blue accent
    └── js/
        ├── chart.umd.min.js    # 100% offline Chart.js bundle
        ├── dashboard.js
        ├── groups.js
        ├── payments.js
        ├── expenses.js
        ├── balances.js
        ├── settlement.js
        └── history.js
```

---

## 8. Database Design (`worksplit.db`)

1. **`groups`**: `id`, `name`, `created_at`
2. **`members`**: `id`, `group_id`, `name`, `created_at`
3. **`work_payments`**: `id`, `group_id`, `amount`, `received_by`, `date`, `split_method`, `notes`, `created_at`
4. **`work_payment_shares`**: `id`, `payment_id`, `member_id`, `share_amount`
5. **`expenses`**: `id`, `group_id`, `description`, `amount`, `paid_by`, `category`, `confidence`, `date`, `split_method`, `created_at`
6. **`expense_shares`**: `id`, `expense_id`, `member_id`, `share_amount`
7. **`settlements`**: `id`, `group_id`, `from_member`, `to_member`, `amount`, `date`, `notes`, `created_at`

All queries use parameterized statements (`?`) to prevent SQL injection.

---

## 9. Installation & Running Instructions

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Train the NLP Model
```bash
python train_model.py
```

### 3. Run Automated Tests
```bash
python test_app.py
```

### 4. Start the Application
```bash
python app.py
```
Open your browser to:
- **Personal Expense & Budget Tracker**: [http://127.0.0.1:5000/personal](http://127.0.0.1:5000/personal)
- **Group Expense & Settlement Dashboard**: [http://127.0.0.1:5000/dashboard](http://127.0.0.1:5000/dashboard)

---

## 10. College Viva & Oral Examination Guide

### Q1: What is NLP?
**Answer**: Natural Language Processing (NLP) is a branch of Artificial Intelligence enabling computers to understand and process human language. Here, NLP tokenizes raw expense descriptions (e.g. *"Uber ride to work"*) and converts them into numeric feature vectors for classification.

### Q2: What is Text Classification?
**Answer**: Text classification is a supervised machine learning task where text is mapped into discrete categories (our 9 categories: Food, Transportation, Work, Shopping, Bills, Entertainment, Healthcare, Education, Other).

### Q3: What is TF-IDF and why is it used?
**Answer**: **Term Frequency - Inverse Document Frequency** weighs words by importance. Words appearing frequently in a specific expense description receive high term frequency ($TF$), while common words across all descriptions are penalized by inverse document frequency ($IDF$). This highlights informative keywords like *"tools"* or *"subway"*.

### Q4: What is Naive Bayes and why is it suitable here?
**Answer**: Naive Bayes applies Bayes' Theorem with the assumption that features are conditionally independent given the class label. It is fast, lightweight, runs 100% offline, requires negligible CPU/memory, and performs accurately on short-text classification without overfitting.

### Q5: What is the Confidence Score?
**Answer**: The confidence score is the maximum posterior probability computed by `predict_proba()` across all 9 classes:
$$\text{Confidence} = \max_{c} P(\text{Category}_c \mid \text{Description})$$

### Q6: What is the difference between the AI prediction and the Settlement calculation?
**Answer**: 
- **AI Prediction**: Probabilistic NLP classification of subjective text descriptions into categories.
- **Settlement Calculation**: Strict, deterministic arithmetic based on double-entry accounting principles. AI is intentionally not used for money math to ensure 100% accuracy, auditability, and zero hallucination.

### Q7: How does the Min-Cash-Flow settlement algorithm work?
**Answer**: It greedily pairs the member with the greatest debt with the member with the greatest credit, transferring the minimum of the two balances. This repeats until all balances are zeroed out, resolving all group debts in at most $N-1$ transactions.
