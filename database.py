import os
import sqlite3
from datetime import datetime

DB_DIR = os.path.join(os.path.dirname(__file__), 'database')
DB_PATH = os.path.join(DB_DIR, 'expenses.db')

def get_connection():
    """Returns a SQLite connection with row_factory set to sqlite3.Row for dict-like access."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initializes the SQLite database schema and seeds initial data if empty."""
    os.makedirs(DB_DIR, exist_ok=True)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                confidence REAL NOT NULL,
                date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.commit()

        # Seed initial sample data if table is empty so the dashboard has visual metrics
        cursor.execute("SELECT COUNT(*) as count FROM expenses")
        row = cursor.fetchone()
        if row and row['count'] == 0:
            today_str = datetime.now().strftime('%Y-%m-%d')
            samples = [
                ("Pizza and burger with friends", 350.00, "Food", 0.92, today_str),
                ("Uber ride to university campus", 180.00, "Transportation", 0.95, today_str),
                ("Monthly electricity bill", 1450.00, "Bills", 0.88, today_str),
                ("Bought college reference books", 850.00, "Education", 0.96, today_str),
                ("Netflix monthly subscription", 649.00, "Entertainment", 0.89, today_str),
                ("Pharmacy cold medicine", 220.00, "Healthcare", 0.84, today_str)
            ]
            cursor.executemany('''
                INSERT INTO expenses (description, amount, category, confidence, date)
                VALUES (?, ?, ?, ?, ?)
            ''', samples)
            conn.commit()
            print("Database initialized and seeded with initial college sample data.")
        else:
            print("Database ready.")

def add_expense(description: str, amount: float, category: str, confidence: float, date: str) -> int:
    """Inserts a new expense record using parameterized queries."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO expenses (description, amount, category, confidence, date)
            VALUES (?, ?, ?, ?, ?)
        ''', (description, amount, category, confidence, date))
        conn.commit()
        return cursor.lastrowid

def get_expenses(search=None, category=None, start_date=None, end_date=None):
    """Retrieves expenses with optional search and filter parameters."""
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM expenses WHERE 1=1"
        params = []

        if search:
            query += " AND description LIKE ?"
            params.append(f"%{search.strip()}%")

        if category and category.lower() != 'all':
            if category.strip() == 'Other':
                query += " AND (category = 'Other' OR category LIKE 'Other (%')"
            else:
                query += " AND category = ?"
                params.append(category.strip())

        if start_date:
            query += " AND date >= ?"
            params.append(start_date.strip())

        if end_date:
            query += " AND date <= ?"
            params.append(end_date.strip())

        query += " ORDER BY date DESC, id DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_expense_by_id(expense_id: int):
    """Retrieves a single expense by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_expense(expense_id: int, description: str, amount: float, category: str, date: str) -> bool:
    """Updates an existing expense record."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE expenses
            SET description = ?, amount = ?, category = ?, date = ?
            WHERE id = ?
        ''', (description, amount, category, date, expense_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_expense(expense_id: int) -> bool:
    """Deletes an expense record by ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_category_summary():
    """Calculates KPI statistics and category-wise spending for dashboard and charts."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Total amount & total transactions
        cursor.execute("SELECT COUNT(*) as total_count, COALESCE(SUM(amount), 0) as total_amount FROM expenses")
        totals = cursor.fetchone()
        total_count = totals['total_count']
        total_amount = totals['total_amount']

        # Category breakdown: Roll up 'Other (...)' into 'Other' for charts and summary
        cursor.execute('''
            SELECT 
                CASE 
                    WHEN category LIKE 'Other (%' THEN 'Other' 
                    ELSE category 
                END as category, 
                COUNT(*) as count, 
                SUM(amount) as total
            FROM expenses
            GROUP BY 
                CASE 
                    WHEN category LIKE 'Other (%' THEN 'Other' 
                    ELSE category 
                END
            ORDER BY total DESC
        ''')
        breakdown_rows = cursor.fetchall()

        category_data = []
        highest_category = "N/A"
        highest_amount = 0.0

        for row in breakdown_rows:
            cat = row['category']
            cat_total = float(row['total'])
            cat_count = int(row['count'])
            if cat_total > highest_amount:
                highest_amount = cat_total
                highest_category = cat

            category_data.append({
                "category": cat,
                "total": round(cat_total, 2),
                "count": cat_count,
                "percentage": round((cat_total / total_amount * 100), 1) if total_amount > 0 else 0
            })

        # Recent 5 expenses
        cursor.execute("SELECT * FROM expenses ORDER BY date DESC, id DESC LIMIT 5")
        recent_rows = cursor.fetchall()
        recent_expenses = [dict(r) for r in recent_rows]

        return {
            "total_expenses": round(total_amount, 2),
            "total_transactions": total_count,
            "highest_category": highest_category,
            "highest_category_amount": round(highest_amount, 2),
            "categories": category_data,
            "recent_expenses": recent_expenses
        }
