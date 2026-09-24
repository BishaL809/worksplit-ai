import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'database')
DB_PATH = os.path.join(DB_DIR, 'worksplit.db')

@contextmanager
def get_connection():
    """Returns a SQLite connection context with foreign keys enabled and dict-like row factory."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """Initializes tables and seeds initial college test scenario data if empty."""
    os.makedirs(DB_DIR, exist_ok=True)
    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. Groups table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 2. Members table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
            )
        ''')

        # 3. Work Payments (Daily Earnings) table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS work_payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                received_by INTEGER NOT NULL,
                date TEXT NOT NULL,
                split_method TEXT DEFAULT 'equal',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (received_by) REFERENCES members(id) ON DELETE CASCADE
            )
        ''')

        # 4. Work Payment Shares
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS work_payment_shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id INTEGER NOT NULL,
                member_id INTEGER NOT NULL,
                share_amount REAL NOT NULL,
                FOREIGN KEY (payment_id) REFERENCES work_payments(id) ON DELETE CASCADE,
                FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
            )
        ''')

        # 5. Expenses table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                description TEXT NOT NULL,
                amount REAL NOT NULL,
                paid_by INTEGER NOT NULL,
                category TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                date TEXT NOT NULL,
                split_method TEXT DEFAULT 'equal',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (paid_by) REFERENCES members(id) ON DELETE CASCADE
            )
        ''')

        # 6. Expense Shares
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS expense_shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                expense_id INTEGER NOT NULL,
                member_id INTEGER NOT NULL,
                share_amount REAL NOT NULL,
                FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
                FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
            )
        ''')

        # 7. Settlements (Recorded transfers between members)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settlements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER NOT NULL,
                from_member INTEGER NOT NULL,
                to_member INTEGER NOT NULL,
                amount REAL NOT NULL,
                date TEXT NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
                FOREIGN KEY (from_member) REFERENCES members(id) ON DELETE CASCADE,
                FOREIGN KEY (to_member) REFERENCES members(id) ON DELETE CASCADE
            )
        ''')

        # 8. Personal Transactions table (Personal Expense Tracker)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS personal_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
                title TEXT NOT NULL,
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                payment_method TEXT DEFAULT 'UPI',
                date TEXT NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 9. Personal Budgets table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS personal_budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                month TEXT NOT NULL UNIQUE,
                budget_amount REAL NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        conn.commit()

        # Seed initial college scenario if groups table is empty
        cursor.execute("SELECT COUNT(*) as count FROM groups")
        if cursor.fetchone()['count'] == 0:
            seed_initial_scenario(conn)

        # Seed initial personal transactions if empty
        cursor.execute("SELECT COUNT(*) as count FROM personal_transactions")
        if cursor.fetchone()['count'] == 0:
            seed_personal_data(conn)

def seed_initial_scenario(conn):
    """Seeds the exact 4-member college scenario: Bishal, Rahul, Aman, Rohit."""
    cursor = conn.cursor()
    today = datetime.now().strftime('%Y-%m-%d')

    # Create Group: Ahmedabad Work
    cursor.execute("INSERT INTO groups (name) VALUES (?)", ("Ahmedabad Work",))
    group_id = cursor.lastrowid

    # Add 4 members
    members = ["Bishal", "Rahul", "Aman", "Rohit"]
    member_ids = {}
    for m in members:
        cursor.execute("INSERT INTO members (group_id, name) VALUES (?, ?)", (group_id, m))
        member_ids[m] = cursor.lastrowid

    # 1. Work Payment: ₹2,000 received by Rahul, shared equally (₹500 each)
    cursor.execute('''
        INSERT INTO work_payments (group_id, amount, received_by, date, split_method, notes)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (group_id, 2000.0, member_ids["Rahul"], today, "equal", "Day 1 Project Earnings"))
    payment_id = cursor.lastrowid

    for m in members:
        cursor.execute('''
            INSERT INTO work_payment_shares (payment_id, member_id, share_amount)
            VALUES (?, ?, ?)
        ''', (payment_id, member_ids[m], 500.0))

    # 2. Expense 1: "Dinner at restaurant" ₹600 paid by Rahul, shared equally (₹150 each)
    cursor.execute('''
        INSERT INTO expenses (group_id, description, amount, paid_by, category, confidence, date, split_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (group_id, "Dinner at restaurant", 600.0, member_ids["Rahul"], "Food", 0.95, today, "equal"))
    expense_1_id = cursor.lastrowid

    for m in members:
        cursor.execute('''
            INSERT INTO expense_shares (expense_id, member_id, share_amount)
            VALUES (?, ?, ?)
        ''', (expense_1_id, member_ids[m], 150.0))

    # 3. Expense 2: "Uber ride" ₹400 paid by Aman, shared equally (₹100 each)
    cursor.execute('''
        INSERT INTO expenses (group_id, description, amount, paid_by, category, confidence, date, split_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (group_id, "Uber ride", 400.0, member_ids["Aman"], "Transportation", 0.96, today, "equal"))
    expense_2_id = cursor.lastrowid

    for m in members:
        cursor.execute('''
            INSERT INTO expense_shares (expense_id, member_id, share_amount)
            VALUES (?, ?, ?)
        ''', (expense_2_id, member_ids[m], 100.0))

    conn.commit()
    print("WorkSplit AI Database initialized & seeded with 'Ahmedabad Work' test scenario.")

def seed_personal_data(conn):
    """Seeds sample personal expenses and income for the current month."""
    cursor = conn.cursor()
    today = datetime.now()
    cur_month = today.strftime('%Y-%m')
    day_prefix = today.strftime('%Y-%m-')

    cursor.execute('''
        INSERT OR IGNORE INTO personal_budgets (month, budget_amount)
        VALUES (?, ?)
    ''', (cur_month, 35000.0))

    sample_txs = [
        ('income', 'Monthly Salary', 50000.0, 'Salary', 'Bank Transfer', f"{day_prefix}01", 'Direct company payroll deposit'),
        ('expense', 'Supermarket Grocery Shopping', 3450.0, 'Food', 'UPI', f"{day_prefix}03", 'Provisions, vegetables & essentials'),
        ('expense', 'Electricity Bill Payment', 1200.0, 'Bills', 'Net Banking', f"{day_prefix}05", 'Electricity bill'),
        ('expense', 'Uber to Client Office', 450.0, 'Transportation', 'UPI', f"{day_prefix}08", 'Cab ride for project meeting'),
        ('expense', 'Weekend Dinner with Friends', 1850.0, 'Food', 'Credit Card', f"{day_prefix}12", 'Dinner at cafe'),
        ('expense', 'High-Speed Broadband Internet', 799.0, 'Bills', 'UPI', f"{day_prefix}15", 'Fiber internet monthly recharge'),
        ('expense', 'Running Shoes', 2499.0, 'Shopping', 'Credit Card', f"{day_prefix}18", 'Sports shoes purchase'),
        ('income', 'Freelance Project Milestone', 15000.0, 'Freelance', 'Bank Transfer', f"{day_prefix}20", 'Freelance web development work')
    ]

    for tx in sample_txs:
        cursor.execute('''
            INSERT INTO personal_transactions (type, title, amount, category, payment_method, date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', tx)

    conn.commit()
    print("Personal Expense Tracker seeded with sample transactions.")

# -------------------------------------------------------------
# Groups CRUD
# -------------------------------------------------------------
def get_groups() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT g.id, g.name, g.created_at, COUNT(m.id) as member_count
            FROM groups g
            LEFT JOIN members m ON g.id = m.group_id
            GROUP BY g.id
            ORDER BY g.id ASC
        ''')
        return [dict(row) for row in cursor.fetchall()]

def get_group_by_id(group_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM groups WHERE id = ?", (group_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def create_group(name: str) -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO groups (name) VALUES (?)", (name.strip(),))
        conn.commit()
        return cursor.lastrowid

def update_group(group_id: int, name: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE groups SET name = ? WHERE id = ?", (name.strip(), group_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_group(group_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM groups WHERE id = ?", (group_id,))
        conn.commit()
        return cursor.rowcount > 0

# -------------------------------------------------------------
# Members CRUD
# -------------------------------------------------------------
def get_members(group_id: int) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM members WHERE group_id = ? ORDER BY name ASC", (group_id,))
        return [dict(row) for row in cursor.fetchall()]

def get_member_by_id(member_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM members WHERE id = ?", (member_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def add_member(group_id: int, name: str) -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO members (group_id, name) VALUES (?, ?)", (group_id, name.strip()))
        conn.commit()
        return cursor.lastrowid

def update_member(member_id: int, name: str) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE members SET name = ? WHERE id = ?", (name.strip(), member_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_member(member_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM members WHERE id = ?", (member_id,))
        conn.commit()
        return cursor.rowcount > 0

# -------------------------------------------------------------
# Work Payments (Income) CRUD
# -------------------------------------------------------------
def get_work_payments(group_id: int) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT wp.*, m.name as receiver_name
            FROM work_payments wp
            JOIN members m ON wp.received_by = m.id
            WHERE wp.group_id = ?
            ORDER BY wp.date DESC, wp.id DESC
        ''', (group_id,))
        payments = [dict(row) for row in cursor.fetchall()]

        # Attach participant shares to each payment
        for p in payments:
            cursor.execute('''
                SELECT s.member_id, s.share_amount, m.name as member_name
                FROM work_payment_shares s
                JOIN members m ON s.member_id = m.id
                WHERE s.payment_id = ?
            ''', (p['id'],))
            p['shares'] = [dict(s) for s in cursor.fetchall()]

        return payments

def get_work_payment_by_id(payment_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT wp.*, m.name as receiver_name
            FROM work_payments wp
            JOIN members m ON wp.received_by = m.id
            WHERE wp.id = ?
        ''', (payment_id,))
        row = cursor.fetchone()
        if not row:
            return None
        payment = dict(row)
        cursor.execute('''
            SELECT s.member_id, s.share_amount, m.name as member_name
            FROM work_payment_shares s
            JOIN members m ON s.member_id = m.id
            WHERE s.payment_id = ?
        ''', (payment_id,))
        payment['shares'] = [dict(s) for s in cursor.fetchall()]
        return payment

def add_work_payment(group_id: int, amount: float, received_by: int, date: str,
                     shares: Dict[int, float], split_method: str = 'equal', notes: str = '') -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO work_payments (group_id, amount, received_by, date, split_method, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (group_id, amount, received_by, date, split_method, notes))
        payment_id = cursor.lastrowid

        # Insert shares
        for member_id, share_amt in shares.items():
            cursor.execute('''
                INSERT INTO work_payment_shares (payment_id, member_id, share_amount)
                VALUES (?, ?, ?)
            ''', (payment_id, int(member_id), float(share_amt)))

        conn.commit()
        return payment_id

def update_work_payment(payment_id: int, amount: float, received_by: int, date: str,
                        shares: Dict[int, float], split_method: str = 'equal', notes: str = '') -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE work_payments
            SET amount = ?, received_by = ?, date = ?, split_method = ?, notes = ?
            WHERE id = ?
        ''', (amount, received_by, date, split_method, notes, payment_id))

        if cursor.rowcount == 0:
            return False

        # Replace shares
        cursor.execute("DELETE FROM work_payment_shares WHERE payment_id = ?", (payment_id,))
        for member_id, share_amt in shares.items():
            cursor.execute('''
                INSERT INTO work_payment_shares (payment_id, member_id, share_amount)
                VALUES (?, ?, ?)
            ''', (payment_id, int(member_id), float(share_amt)))

        conn.commit()
        return True

def delete_work_payment(payment_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM work_payments WHERE id = ?", (payment_id,))
        conn.commit()
        return cursor.rowcount > 0

# -------------------------------------------------------------
# Expenses CRUD
# -------------------------------------------------------------
def get_expenses(group_id: int, search: str = None, category: str = None,
                 member_id: int = None, start_date: str = None, end_date: str = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        query = '''
            SELECT e.*, m.name as payer_name
            FROM expenses e
            JOIN members m ON e.paid_by = m.id
            WHERE e.group_id = ?
        '''
        params = [group_id]

        if search:
            query += " AND e.description LIKE ?"
            params.append(f"%{search.strip()}%")

        if category and category.lower() != 'all':
            if category.strip() == 'Other':
                query += " AND (e.category = 'Other' OR e.category LIKE 'Other (%')"
            else:
                query += " AND e.category = ?"
                params.append(category.strip())

        if member_id:
            query += " AND e.paid_by = ?"
            params.append(member_id)

        if start_date:
            query += " AND e.date >= ?"
            params.append(start_date.strip())

        if end_date:
            query += " AND e.date <= ?"
            params.append(end_date.strip())

        query += " ORDER BY e.date DESC, e.id DESC"
        cursor.execute(query, params)
        expenses = [dict(row) for row in cursor.fetchall()]

        for exp in expenses:
            cursor.execute('''
                SELECT s.member_id, s.share_amount, m.name as member_name
                FROM expense_shares s
                JOIN members m ON s.member_id = m.id
                WHERE s.expense_id = ?
            ''', (exp['id'],))
            exp['shares'] = [dict(s) for s in cursor.fetchall()]

        return expenses

def get_expense_by_id(expense_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT e.*, m.name as payer_name
            FROM expenses e
            JOIN members m ON e.paid_by = m.id
            WHERE e.id = ?
        ''', (expense_id,))
        row = cursor.fetchone()
        if not row:
            return None
        exp = dict(row)
        cursor.execute('''
            SELECT s.member_id, s.share_amount, m.name as member_name
            FROM expense_shares s
            JOIN members m ON s.member_id = m.id
            WHERE s.expense_id = ?
        ''', (expense_id,))
        exp['shares'] = [dict(s) for s in cursor.fetchall()]
        return exp

def add_expense(group_id: int, description: str, amount: float, paid_by: int,
                category: str, confidence: float, date: str, shares: Dict[int, float],
                split_method: str = 'equal') -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO expenses (group_id, description, amount, paid_by, category, confidence, date, split_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (group_id, description.strip(), amount, paid_by, category.strip(), confidence, date, split_method))
        expense_id = cursor.lastrowid

        for member_id, share_amt in shares.items():
            cursor.execute('''
                INSERT INTO expense_shares (expense_id, member_id, share_amount)
                VALUES (?, ?, ?)
            ''', (expense_id, int(member_id), float(share_amt)))

        conn.commit()
        return expense_id

def update_expense(expense_id: int, description: str, amount: float, paid_by: int,
                   category: str, date: str, shares: Dict[int, float], split_method: str = 'equal') -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE expenses
            SET description = ?, amount = ?, paid_by = ?, category = ?, date = ?, split_method = ?
            WHERE id = ?
        ''', (description.strip(), amount, paid_by, category.strip(), date, split_method, expense_id))

        if cursor.rowcount == 0:
            return False

        cursor.execute("DELETE FROM expense_shares WHERE expense_id = ?", (expense_id,))
        for member_id, share_amt in shares.items():
            cursor.execute('''
                INSERT INTO expense_shares (expense_id, member_id, share_amount)
                VALUES (?, ?, ?)
            ''', (expense_id, int(member_id), float(share_amt)))

        conn.commit()
        return True

def delete_expense(expense_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
        return cursor.rowcount > 0

# -------------------------------------------------------------
# Settlements CRUD
# -------------------------------------------------------------
def get_settlements(group_id: int) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT s.*, m1.name as from_member_name, m2.name as to_member_name
            FROM settlements s
            JOIN members m1 ON s.from_member = m1.id
            JOIN members m2 ON s.to_member = m2.id
            WHERE s.group_id = ?
            ORDER BY s.date DESC, s.id DESC
        ''', (group_id,))
        return [dict(row) for row in cursor.fetchall()]

def add_settlement(group_id: int, from_member: int, to_member: int, amount: float, date: str, notes: str = '') -> int:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO settlements (group_id, from_member, to_member, amount, date, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (group_id, from_member, to_member, amount, date, notes.strip()))
        conn.commit()
        return cursor.lastrowid

def delete_settlement(settlement_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM settlements WHERE id = ?", (settlement_id,))
        conn.commit()
        return cursor.rowcount > 0

# -------------------------------------------------------------
# Category Summary Aggregation (for Chart.js & tables)
# -------------------------------------------------------------
def get_category_summary(group_id: int) -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE group_id = ?", (group_id,))
        total_expense = cursor.fetchone()['total']

        cursor.execute('''
            SELECT 
                CASE 
                    WHEN category LIKE 'Other (%' THEN 'Other' 
                    ELSE category 
                END as base_cat,
                COUNT(*) as count,
                SUM(amount) as total
            FROM expenses
            WHERE group_id = ?
            GROUP BY base_cat
            ORDER BY total DESC
        ''', (group_id,))
        rows = cursor.fetchall()

        categories = []
        for r in rows:
            cat_name = r['base_cat']
            cat_total = float(r['total'])
            categories.append({
                'category': cat_name,
                'total': round(cat_total, 2),
                'count': int(r['count']),
                'percentage': round((cat_total / total_expense * 100), 1) if total_expense > 0 else 0.0
            })

        return {
            'total_expense': round(total_expense, 2),
            'categories': categories
        }

# -------------------------------------------------------------
# Unified Transaction History (Payments, Expenses, Settlements)
# -------------------------------------------------------------
def get_unified_transactions(group_id: int, txn_type: str = 'all', search: str = None,
                             category: str = None, member_id: int = None,
                             start_date: str = None, end_date: str = None) -> List[Dict[str, Any]]:
    """Combines Work Payments, Expenses, and Settlements into a single unified stream."""
    all_txns = []

    # 1. Work Payments
    if txn_type in ['all', 'payment']:
        payments = get_work_payments(group_id)
        for p in payments:
            if member_id and p['received_by'] != member_id and not any(s['member_id'] == member_id for s in p['shares']):
                continue
            if search and search.lower() not in (p['notes'] or '').lower() and 'work payment' not in search.lower():
                continue
            if start_date and p['date'] < start_date:
                continue
            if end_date and p['date'] > end_date:
                continue
            all_txns.append({
                'id': p['id'],
                'type': 'WORK PAYMENT',
                'description': p['notes'] or 'Work Earnings Payment',
                'amount': p['amount'],
                'primary_person': p['receiver_name'],
                'primary_role': 'Received by',
                'category': 'Income',
                'date': p['date'],
                'participants': [s['member_name'] for s in p['shares']],
                'raw': p
            })

    # 2. Expenses
    if txn_type in ['all', 'expense']:
        expenses = get_expenses(group_id, search, category, member_id, start_date, end_date)
        for e in expenses:
            all_txns.append({
                'id': e['id'],
                'type': 'EXPENSE',
                'description': e['description'],
                'amount': e['amount'],
                'primary_person': e['payer_name'],
                'primary_role': 'Paid by',
                'category': e['category'],
                'confidence': e['confidence'],
                'date': e['date'],
                'participants': [s['member_name'] for s in e['shares']],
                'raw': e
            })

    # 3. Settlements
    if txn_type in ['all', 'settlement']:
        settlements = get_settlements(group_id)
        for s in settlements:
            if member_id and s['from_member'] != member_id and s['to_member'] != member_id:
                continue
            if search and search.lower() not in f"{s['from_member_name']} {s['to_member_name']} settlement".lower():
                continue
            if start_date and s['date'] < start_date:
                continue
            if end_date and s['date'] > end_date:
                continue
            all_txns.append({
                'id': s['id'],
                'type': 'SETTLEMENT',
                'description': f"{s['from_member_name']} paid {s['to_member_name']}",
                'amount': s['amount'],
                'primary_person': s['from_member_name'],
                'primary_role': 'Paid to ' + s['to_member_name'],
                'category': 'Settlement',
                'date': s['date'],
                'participants': [s['from_member_name'], s['to_member_name']],
                'raw': s
            })

    # Sort descending by date, then id
    all_txns.sort(key=lambda x: (x['date'], x['id']), reverse=True)
    return all_txns

# -------------------------------------------------------------
# Personal Expense Tracker CRUD & Summary
# -------------------------------------------------------------

def add_personal_transaction(tx_type: str, title: str, amount: float, category: str, payment_method: str = "UPI", date: str = None, notes: str = "") -> int:
    if not date:
        date = datetime.now().strftime('%Y-%m-%d')
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO personal_transactions (type, title, amount, category, payment_method, date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (tx_type, title.strip(), float(amount), category.strip(), payment_method.strip(), date.strip(), (notes or '').strip()))
        conn.commit()
        return cursor.lastrowid

def get_personal_transactions(month: Optional[str] = None, tx_type: Optional[str] = None, category: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM personal_transactions WHERE 1=1"
        params = []

        if month:
            query += " AND strftime('%Y-%m', date) = ?"
            params.append(month)

        if tx_type and tx_type != 'all':
            query += " AND type = ?"
            params.append(tx_type)

        if category and category != 'all':
            query += " AND category = ?"
            params.append(category)

        if search:
            query += " AND (title LIKE ? OR notes LIKE ? OR category LIKE ?)"
            s_param = f"%{search}%"
            params.extend([s_param, s_param, s_param])

        query += " ORDER BY date DESC, id DESC"
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_personal_transaction_by_id(tx_id: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM personal_transactions WHERE id = ?", (tx_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_personal_transaction(tx_id: int, tx_type: str, title: str, amount: float, category: str, payment_method: str, date: str, notes: str = "") -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE personal_transactions
            SET type = ?, title = ?, amount = ?, category = ?, payment_method = ?, date = ?, notes = ?
            WHERE id = ?
        ''', (tx_type, title.strip(), float(amount), category.strip(), payment_method.strip(), date.strip(), (notes or '').strip(), tx_id))
        conn.commit()
        return cursor.rowcount > 0

def delete_personal_transaction(tx_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM personal_transactions WHERE id = ?", (tx_id,))
        conn.commit()
        return cursor.rowcount > 0

def get_personal_budget(month: str) -> float:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT budget_amount FROM personal_budgets WHERE month = ?", (month,))
        row = cursor.fetchone()
        return float(row['budget_amount']) if row else 0.0

def set_personal_budget(month: str, amount: float) -> bool:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO personal_budgets (month, budget_amount)
            VALUES (?, ?)
            ON CONFLICT(month) DO UPDATE SET budget_amount = excluded.budget_amount
        ''', (month, float(amount)))
        conn.commit()
        return True

def get_personal_summary(month: str) -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        # Total income & total expense for the month
        cursor.execute('''
            SELECT 
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0.0) as total_income,
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0.0) as total_expense,
                COUNT(id) as transaction_count
            FROM personal_transactions
            WHERE strftime('%Y-%m', date) = ?
        ''', (month,))
        totals = cursor.fetchone()
        total_income = float(totals['total_income'])
        total_expense = float(totals['total_expense'])
        tx_count = int(totals['transaction_count'])
        net_savings = total_income - total_expense

        # Monthly Budget
        budget = get_personal_budget(month)
        budget_remaining = budget - total_expense if budget > 0 else 0.0
        budget_percent = round((total_expense / budget) * 100, 1) if budget > 0 else 0.0

        # Expense breakdown by category
        cursor.execute('''
            SELECT category, SUM(amount) as total
            FROM personal_transactions
            WHERE strftime('%Y-%m', date) = ? AND type = 'expense'
            GROUP BY category
            ORDER BY total DESC
        ''', (month,))
        category_rows = cursor.fetchall()
        category_breakdown = []
        for r in category_rows:
            cat_total = float(r['total'])
            cat_pct = round((cat_total / total_expense) * 100, 1) if total_expense > 0 else 0.0
            category_breakdown.append({
                'category': r['category'],
                'total': cat_total,
                'percent': cat_pct
            })

        # Daily spending for trend chart
        cursor.execute('''
            SELECT date, SUM(amount) as daily_total
            FROM personal_transactions
            WHERE strftime('%Y-%m', date) = ? AND type = 'expense'
            GROUP BY date
            ORDER BY date ASC
        ''', (month,))
        daily_rows = cursor.fetchall()
        daily_spending = [{'date': r['date'], 'total': float(r['daily_total'])} for r in daily_rows]

        # Breakdown by payment method
        cursor.execute('''
            SELECT payment_method, SUM(amount) as total
            FROM personal_transactions
            WHERE strftime('%Y-%m', date) = ? AND type = 'expense'
            GROUP BY payment_method
            ORDER BY total DESC
        ''', (month,))
        pm_rows = cursor.fetchall()
        payment_methods = [{'method': r['payment_method'] or 'Other', 'total': float(r['total'])} for r in pm_rows]

        return {
            'month': month,
            'total_income': round(total_income, 2),
            'total_expense': round(total_expense, 2),
            'net_savings': round(net_savings, 2),
            'budget_amount': round(budget, 2),
            'budget_remaining': round(budget_remaining, 2),
            'budget_percent': budget_percent,
            'is_over_budget': (total_expense > budget) if budget > 0 else False,
            'transaction_count': tx_count,
            'category_breakdown': category_breakdown,
            'daily_spending': daily_spending,
            'payment_methods': payment_methods
        }

