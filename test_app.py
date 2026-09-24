import unittest
import json
import sys

# Configure stdout for cross-platform unicode safety
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from app import app
from services import database_service as db
from services import settlement_service as settlement_svc
from services import ai_service as ai_svc

class TestWorkSplitAI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config['TESTING'] = True
        cls.client = app.test_client()
        # Initialize schema and pre-seeded college scenario
        db.init_db()
        groups = db.get_groups()
        if not any(g['name'] == 'Ahmedabad Work' for g in groups):
            with db.get_connection() as conn:
                db.seed_initial_scenario(conn)

    def test_01_nlp_categories_including_work(self):
        """Verify NLP model predictions on key categories including 'Work'."""
        test_cases = [
            ("Dinner at restaurant", "Food"),
            ("Uber ride to work", "Transportation"),
            ("Bought tools for work", "Work"),
            ("Electricity bill", "Bills"),
            ("Netflix subscription", "Entertainment"),
            ("Bought new shoes", "Shopping"),
            ("Bought medicine", "Healthcare"),
            ("College books", "Education")
        ]

        print("\n--- Testing WorkSplit AI NLP Categorization ---")
        for desc, expected in test_cases:
            res = self.client.post('/predict',
                data=json.dumps({'description': desc}),
                content_type='application/json'
            )
            self.assertEqual(res.status_code, 200)
            data = json.loads(res.data)
            print(f"  '{desc}' -> Predicted: {data['category']} ({data['confidence_percent']}%) [Expected: {expected}]")
            self.assertEqual(data['category'], expected)
            self.assertGreater(data['confidence'], 0.5)

    def test_02_explain_feature(self):
        """Verify the local AI explanation endpoint."""
        res = self.client.post('/explain',
            data=json.dumps({'description': 'Dinner at restaurant', 'category': 'Food'}),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('explanation', data)
        self.assertIn('restaurant', data['explanation'].lower())
        print(f"  AI Explanation Output: {data['explanation']}")

    def test_03_exact_college_test_scenario(self):
        """
        Verify the exact scenario specified in Prompt Section 29:
        GROUP: Bishal, Rahul, Aman, Rohit
        WORK PAYMENT: ₹2,000 received by Rahul (₹500 each)
        EXPENSE 1: 'Dinner at restaurant' ₹600 paid by Rahul (₹150 each)
        EXPENSE 2: 'Uber ride' ₹400 paid by Aman (₹100 each)
        """
        print("\n--- Verifying Exact College Mathematical Scenario ---")
        # Find the seeded 'Ahmedabad Work' group
        groups = db.get_groups()
        ahmedabad_group = next((g for g in groups if g['name'] == 'Ahmedabad Work'), None)
        self.assertIsNotNone(ahmedabad_group, "Seeded 'Ahmedabad Work' group must exist")
        group_id = ahmedabad_group['id']

        # Query calculated balances
        bal_res = self.client.get(f'/api/balances?group_id={group_id}')
        self.assertEqual(bal_res.status_code, 200)
        bal_data = json.loads(bal_res.data)
        members = {m['name']: m for m in bal_data['members']}

        # Assert balances
        print(f"  Bishal Balance: Rs.{members['Bishal']['net_balance']:+.2f} ({members['Bishal']['status']})")
        print(f"  Rahul Balance:  Rs.{members['Rahul']['net_balance']:+.2f} ({members['Rahul']['status']})")
        print(f"  Aman Balance:   Rs.{members['Aman']['net_balance']:+.2f} ({members['Aman']['status']})")
        print(f"  Rohit Balance:  Rs.{members['Rohit']['net_balance']:+.2f} ({members['Rohit']['status']})")

        self.assertAlmostEqual(members['Bishal']['net_balance'], 250.0, places=2)
        self.assertEqual(members['Bishal']['status'], 'Should Receive')

        self.assertAlmostEqual(members['Rahul']['net_balance'], -1150.0, places=2)
        self.assertEqual(members['Rahul']['status'], 'Needs to Pay')

        self.assertAlmostEqual(members['Aman']['net_balance'], 650.0, places=2)
        self.assertEqual(members['Aman']['status'], 'Should Receive')

        self.assertAlmostEqual(members['Rohit']['net_balance'], 250.0, places=2)
        self.assertEqual(members['Rohit']['status'], 'Should Receive')

        # Assert Zero-Sum Invariant
        total_sum = sum(m['net_balance'] for m in bal_data['members'])
        self.assertAlmostEqual(total_sum, 0.0, places=2)
        print("  Zero-Sum Invariant Checked: Total sum of net balances is exactly 0.00")

        # Verify Min-Cash Settlement Plan
        settle_res = self.client.get(f'/api/settlement?group_id={group_id}')
        self.assertEqual(settle_res.status_code, 200)
        settle_data = json.loads(settle_res.data)
        plan = settle_data['settlement_plan']

        print("\n--- Verifying Who-Pays-Whom Settlement Plan ---")
        for item in plan:
            print(f"  {item['from_name']} -> {item['to_name']} : Rs.{item['amount']:.2f}")

        # The debtor is Rahul (-Rs.1,150). Creditors are Aman (650), Bishal (250), Rohit (250).
        # Rahul should pay Aman 650, Bishal 250, Rohit 250. Total = 1,150.
        self.assertEqual(len(plan), 3)
        self.assertTrue(all(p['from_name'] == 'Rahul' for p in plan))
        settled_receivers = {p['to_name']: p['amount'] for p in plan}
        self.assertAlmostEqual(settled_receivers['Aman'], 650.0, places=2)
        self.assertAlmostEqual(settled_receivers['Bishal'], 250.0, places=2)
        self.assertAlmostEqual(settled_receivers['Rohit'], 250.0, places=2)

    def test_04_split_validation_errors(self):
        """Verify that invalid splits and negative amounts are rejected."""
        groups = db.get_groups()
        group_id = groups[0]['id']
        members = db.get_members(group_id)

        # Mismatched split: payment amount ₹1000, but shares total ₹800
        invalid_payload = {
            'group_id': group_id,
            'amount': 1000.0,
            'received_by': members[0]['id'],
            'date': '2026-09-23',
            'split_method': 'custom',
            'shares': {
                members[0]['id']: 400.0,
                members[1]['id']: 400.0
            }
        }
        res = self.client.post('/api/payments',
            data=json.dumps(invalid_payload),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('does not match', json.loads(res.data)['error'])

    def test_05_unified_transactions_and_filtering(self):
        """Verify unified transaction query and filtering."""
        groups = db.get_groups()
        group_id = groups[0]['id']

        res = self.client.get(f'/api/transactions?group_id={group_id}&type=all')
        self.assertEqual(res.status_code, 200)
        txns = json.loads(res.data)['transactions']
        self.assertGreaterEqual(len(txns), 3)
        types = {t['type'] for t in txns}
        self.assertIn('WORK PAYMENT', types)
        self.assertIn('EXPENSE', types)

    def test_06_personal_expense_tracker_crud_and_summary(self):
        """Verify Personal Expense Tracker CRUD, AI categorization, budget, summary and CSV export."""
        print("\n--- Testing Personal Expense Tracker API ---")
        today = "2026-09-24"
        month = "2026-09"

        # 1. Add Personal Income
        inc_res = self.client.post('/api/personal/transactions',
            data=json.dumps({
                'type': 'income',
                'title': 'Consulting Honorarium',
                'amount': 25000.0,
                'category': 'Salary',
                'payment_method': 'Bank Transfer',
                'date': today,
                'notes': 'Quarterly consulting'
            }),
            content_type='application/json'
        )
        self.assertEqual(inc_res.status_code, 201)
        inc_data = json.loads(inc_res.data)
        inc_id = inc_data['transaction']['id']
        self.assertEqual(inc_data['transaction']['title'], 'Consulting Honorarium')

        # 2. Add Personal Expense with AI auto-categorization fallback
        exp_res = self.client.post('/api/personal/transactions',
            data=json.dumps({
                'type': 'expense',
                'title': 'Dinner at Italian restaurant',
                'amount': 1450.0,
                'category': '',  # Empty category to trigger AI prediction
                'payment_method': 'UPI',
                'date': today,
                'notes': 'Pasta & drinks'
            }),
            content_type='application/json'
        )
        self.assertEqual(exp_res.status_code, 201)
        exp_data = json.loads(exp_res.data)
        exp_id = exp_data['transaction']['id']
        # Should have auto-predicted 'Food'
        self.assertEqual(exp_data['transaction']['category'], 'Food')
        print(f"  AI Auto-Categorized '{exp_data['transaction']['title']}' -> {exp_data['transaction']['category']}")

        # 3. Set Monthly Budget
        bud_res = self.client.post('/api/personal/budget',
            data=json.dumps({
                'month': month,
                'budget_amount': 30000.0
            }),
            content_type='application/json'
        )
        self.assertEqual(bud_res.status_code, 200)
        self.assertEqual(json.loads(bud_res.data)['budget_amount'], 30000.0)

        # 4. Fetch Summary
        sum_res = self.client.get(f'/api/personal/summary?month={month}')
        self.assertEqual(sum_res.status_code, 200)
        sum_data = json.loads(sum_res.data)
        self.assertGreaterEqual(sum_data['total_income'], 25000.0)
        self.assertGreaterEqual(sum_data['total_expense'], 1450.0)
        self.assertEqual(sum_data['budget_amount'], 30000.0)
        self.assertIn('category_breakdown', sum_data)
        self.assertIn('daily_spending', sum_data)
        print(f"  Personal Summary: Income=Rs.{sum_data['total_income']}, Expense=Rs.{sum_data['total_expense']}, Net=Rs.{sum_data['net_savings']}, Budget=Rs.{sum_data['budget_amount']}")

        # 5. Update Expense
        upd_res = self.client.put(f'/api/personal/transactions/{exp_id}',
            data=json.dumps({
                'type': 'expense',
                'title': 'Dinner at Italian cafe and gelato',
                'amount': 1600.0,
                'category': 'Food',
                'payment_method': 'Credit Card',
                'date': today,
                'notes': 'Updated bill'
            }),
            content_type='application/json'
        )
        self.assertEqual(upd_res.status_code, 200)
        upd_data = json.loads(upd_res.data)
        self.assertEqual(upd_data['transaction']['amount'], 1600.0)

        # 6. Export CSV
        csv_res = self.client.get(f'/api/personal/export?month={month}')
        self.assertEqual(csv_res.status_code, 200)
        self.assertEqual(csv_res.content_type, 'text/csv; charset=utf-8')
        csv_text = csv_res.data.decode('utf-8')
        self.assertIn('Italian cafe', csv_text)
        print("  CSV Export validated successfully.")

        # 7. Delete Test Transactions
        del1 = self.client.delete(f'/api/personal/transactions/{inc_id}')
        del2 = self.client.delete(f'/api/personal/transactions/{exp_id}')
        self.assertEqual(del1.status_code, 200)
        self.assertEqual(del2.status_code, 200)
        print("  Personal Transaction deletion verified.")

if __name__ == '__main__':
    unittest.main()

