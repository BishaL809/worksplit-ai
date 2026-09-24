import os
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, Response

from services import database_service as db
from services import settlement_service as settlement_svc
from services import ai_service as ai_svc

app = Flask(__name__)

# Initialize database schema and pre-load AI models
db.init_db()
ai_svc.ensure_model_loaded()

# -------------------------------------------------------------
# Web Page Views
# -------------------------------------------------------------
@app.route('/')
def index():
    return redirect(url_for('dashboard_page'))

@app.route('/dashboard')
def dashboard_page():
    return render_template('dashboard.html')

@app.route('/personal')
def personal_page():
    cur_month = datetime.now().strftime('%Y-%m')
    return render_template('personal.html', cur_month=cur_month)

@app.route('/groups')
def groups_page():
    return render_template('groups.html')

@app.route('/payments')
def payments_page():
    today = datetime.now().strftime('%Y-%m-%d')
    return render_template('payments.html', today=today)

@app.route('/expenses')
def expenses_page():
    today = datetime.now().strftime('%Y-%m-%d')
    return render_template('expenses.html', today=today)

@app.route('/balances')
def balances_page():
    return render_template('balances.html')

@app.route('/settlement')
def settlement_page():
    today = datetime.now().strftime('%Y-%m-%d')
    return render_template('settlement.html', today=today)

@app.route('/history')
def history_page():
    return render_template('history.html')

# -------------------------------------------------------------
# AI Prediction & Explanation API
# -------------------------------------------------------------
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json(silent=True) or request.form
        if not data or 'description' not in data:
            return jsonify({'error': 'Description is required.'}), 400

        desc = str(data.get('description', '')).strip()
        if not desc:
            return jsonify({'error': 'Description cannot be empty.'}), 400

        result = ai_svc.predict_category(desc)
        return jsonify(result), 200
    except Exception as e:
        print(f"Prediction error: {e}")
        return jsonify({'error': 'Internal ML classification failed.'}), 500

@app.route('/explain', methods=['POST'])
def explain():
    try:
        data = request.get_json(silent=True) or request.form
        if not data or 'description' not in data:
            return jsonify({'error': 'Description is required.'}), 400

        desc = str(data.get('description', '')).strip()
        category = data.get('category')
        explanation = ai_svc.explain_prediction(desc, category)
        return jsonify(explanation), 200
    except Exception as e:
        print(f"Explanation error: {e}")
        return jsonify({'error': 'Could not generate explanation.'}), 500

# -------------------------------------------------------------
# Groups & Members API
# -------------------------------------------------------------
@app.route('/api/groups', methods=['GET', 'POST'])
def api_groups():
    if request.method == 'GET':
        groups = db.get_groups()
        return jsonify({'groups': groups}), 200

    # POST create group
    data = request.get_json(silent=True) or request.form
    name = str(data.get('name', '')).strip()
    if not name:
        return jsonify({'error': 'Group name is required.'}), 400

    group_id = db.create_group(name)
    return jsonify({'success': True, 'group_id': group_id, 'message': 'Group created successfully.'}), 201

@app.route('/api/groups/<int:group_id>', methods=['GET', 'PUT', 'DELETE'])
def api_group_detail(group_id):
    if request.method == 'GET':
        g = db.get_group_by_id(group_id)
        if not g:
            return jsonify({'error': 'Group not found.'}), 404
        return jsonify({'group': g}), 200

    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form
        name = str(data.get('name', '')).strip()
        if not name:
            return jsonify({'error': 'Group name cannot be empty.'}), 400
        updated = db.update_group(group_id, name)
        if not updated:
            return jsonify({'error': 'Group not found.'}), 404
        return jsonify({'success': True, 'message': 'Group updated.'}), 200

    if request.method == 'DELETE':
        deleted = db.delete_group(group_id)
        if not deleted:
            return jsonify({'error': 'Group not found.'}), 404
        return jsonify({'success': True, 'message': 'Group deleted.'}), 200

@app.route('/api/groups/<int:group_id>/members', methods=['GET', 'POST'])
def api_group_members(group_id):
    if request.method == 'GET':
        members = db.get_members(group_id)
        return jsonify({'members': members}), 200

    # POST add member
    data = request.get_json(silent=True) or request.form
    name = str(data.get('name', '')).strip()
    if not name:
        return jsonify({'error': 'Member name is required.'}), 400

    member_id = db.add_member(group_id, name)
    return jsonify({'success': True, 'member_id': member_id, 'message': 'Member added.'}), 201

@app.route('/api/members/<int:member_id>', methods=['PUT', 'DELETE'])
def api_member_detail(member_id):
    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form
        name = str(data.get('name', '')).strip()
        if not name:
            return jsonify({'error': 'Member name cannot be empty.'}), 400
        updated = db.update_member(member_id, name)
        if not updated:
            return jsonify({'error': 'Member not found.'}), 404
        return jsonify({'success': True, 'message': 'Member updated.'}), 200

    if request.method == 'DELETE':
        deleted = db.delete_member(member_id)
        if not deleted:
            return jsonify({'error': 'Member not found.'}), 404
        return jsonify({'success': True, 'message': 'Member deleted.'}), 200

# -------------------------------------------------------------
# Work Payments API
# -------------------------------------------------------------
@app.route('/api/payments', methods=['GET', 'POST'])
def api_payments():
    if request.method == 'GET':
        group_id = request.args.get('group_id', type=int)
        if not group_id:
            return jsonify({'error': 'group_id parameter is required.'}), 400
        payments = db.get_work_payments(group_id)
        return jsonify({'payments': payments}), 200

    # POST add payment
    data = request.get_json(silent=True) or request.form
    try:
        group_id = int(data.get('group_id'))
        amount = float(data.get('amount', 0))
        received_by = int(data.get('received_by'))
        date = str(data.get('date', '')).strip()
        split_method = str(data.get('split_method', 'equal')).strip()
        notes = str(data.get('notes', '')).strip()
        shares = data.get('shares', {})  # { member_id: share_amount }

        if amount <= 0:
            return jsonify({'error': 'Payment amount must be greater than zero.'}), 400
        if not date:
            return jsonify({'error': 'Date is required.'}), 400
        if not shares:
            return jsonify({'error': 'At least one participant share is required.'}), 400

        # Validate that sum of shares equals total payment amount (within 0.05 tolerance for rounding)
        shares_dict = {int(k): float(v) for k, v in shares.items()}
        total_shares = sum(shares_dict.values())
        if abs(total_shares - amount) > 0.05:
            return jsonify({'error': f'Total shares sum (₹{total_shares:.2f}) does not match payment amount (₹{amount:.2f}).'}), 400

        payment_id = db.add_work_payment(group_id, amount, received_by, date, shares_dict, split_method, notes)
        return jsonify({'success': True, 'payment_id': payment_id, 'message': 'Work payment recorded.'}), 201

    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        print(f"Error adding payment: {e}")
        return jsonify({'error': 'Failed to save payment.'}), 500

@app.route('/api/payments/<int:payment_id>', methods=['GET', 'PUT', 'DELETE'])
def api_payment_detail(payment_id):
    if request.method == 'GET':
        p = db.get_work_payment_by_id(payment_id)
        if not p:
            return jsonify({'error': 'Payment not found.'}), 404
        return jsonify({'payment': p}), 200

    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form
        try:
            amount = float(data.get('amount', 0))
            received_by = int(data.get('received_by'))
            date = str(data.get('date', '')).strip()
            split_method = str(data.get('split_method', 'equal')).strip()
            notes = str(data.get('notes', '')).strip()
            shares = data.get('shares', {})

            if amount <= 0:
                return jsonify({'error': 'Amount must be greater than zero.'}), 400
            shares_dict = {int(k): float(v) for k, v in shares.items()}
            total_shares = sum(shares_dict.values())
            if abs(total_shares - amount) > 0.05:
                return jsonify({'error': f'Total shares sum (₹{total_shares:.2f}) does not match amount (₹{amount:.2f}).'}), 400

            updated = db.update_work_payment(payment_id, amount, received_by, date, shares_dict, split_method, notes)
            if not updated:
                return jsonify({'error': 'Payment not found.'}), 404
            return jsonify({'success': True, 'message': 'Payment updated.'}), 200
        except (ValueError, TypeError) as e:
            return jsonify({'error': f'Invalid input: {str(e)}'}), 400

    if request.method == 'DELETE':
        deleted = db.delete_work_payment(payment_id)
        if not deleted:
            return jsonify({'error': 'Payment not found.'}), 404
        return jsonify({'success': True, 'message': 'Payment deleted.'}), 200

# -------------------------------------------------------------
# Expenses API
# -------------------------------------------------------------
@app.route('/api/expenses', methods=['GET', 'POST'])
def api_expenses():
    if request.method == 'GET':
        group_id = request.args.get('group_id', type=int)
        if not group_id:
            return jsonify({'error': 'group_id parameter is required.'}), 400

        search = request.args.get('search')
        category = request.args.get('category')
        member_id = request.args.get('member_id', type=int)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        expenses = db.get_expenses(group_id, search, category, member_id, start_date, end_date)
        return jsonify({'expenses': expenses}), 200

    # POST add expense
    data = request.get_json(silent=True) or request.form
    try:
        group_id = int(data.get('group_id'))
        desc = str(data.get('description', '')).strip()
        amount = float(data.get('amount', 0))
        paid_by = int(data.get('paid_by'))
        category = str(data.get('category', 'Other')).strip()
        confidence = float(data.get('confidence', 1.0))
        date = str(data.get('date', '')).strip()
        split_method = str(data.get('split_method', 'equal')).strip()
        shares = data.get('shares', {})

        if not desc:
            return jsonify({'error': 'Expense description is required.'}), 400
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than zero.'}), 400
        if not date:
            return jsonify({'error': 'Date is required.'}), 400
        if not shares:
            return jsonify({'error': 'At least one participant share is required.'}), 400

        shares_dict = {int(k): float(v) for k, v in shares.items()}
        total_shares = sum(shares_dict.values())
        if abs(total_shares - amount) > 0.05:
            return jsonify({'error': f'Total shares sum (₹{total_shares:.2f}) does not match expense amount (₹{amount:.2f}).'}), 400

        expense_id = db.add_expense(group_id, desc, amount, paid_by, category, confidence, date, shares_dict, split_method)
        return jsonify({'success': True, 'expense_id': expense_id, 'message': 'Expense recorded.'}), 201

    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        print(f"Error adding expense: {e}")
        return jsonify({'error': 'Failed to save expense.'}), 500

@app.route('/api/expenses/<int:expense_id>', methods=['GET', 'PUT', 'DELETE'])
def api_expense_detail(expense_id):
    if request.method == 'GET':
        e = db.get_expense_by_id(expense_id)
        if not e:
            return jsonify({'error': 'Expense not found.'}), 404
        return jsonify({'expense': e}), 200

    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form
        try:
            desc = str(data.get('description', '')).strip()
            amount = float(data.get('amount', 0))
            paid_by = int(data.get('paid_by'))
            category = str(data.get('category', 'Other')).strip()
            date = str(data.get('date', '')).strip()
            split_method = str(data.get('split_method', 'equal')).strip()
            shares = data.get('shares', {})

            if not desc:
                return jsonify({'error': 'Description cannot be empty.'}), 400
            if amount <= 0:
                return jsonify({'error': 'Amount must be greater than zero.'}), 400

            shares_dict = {int(k): float(v) for k, v in shares.items()}
            total_shares = sum(shares_dict.values())
            if abs(total_shares - amount) > 0.05:
                return jsonify({'error': f'Total shares sum (₹{total_shares:.2f}) does not match expense amount (₹{amount:.2f}).'}), 400

            updated = db.update_expense(expense_id, desc, amount, paid_by, category, date, shares_dict, split_method)
            if not updated:
                return jsonify({'error': 'Expense not found.'}), 404
            return jsonify({'success': True, 'message': 'Expense updated.'}), 200
        except (ValueError, TypeError) as e:
            return jsonify({'error': f'Invalid input: {str(e)}'}), 400

    if request.method == 'DELETE':
        deleted = db.delete_expense(expense_id)
        if not deleted:
            return jsonify({'error': 'Expense not found.'}), 404
        return jsonify({'success': True, 'message': 'Expense deleted.'}), 200

# -------------------------------------------------------------
# Settlements API
# -------------------------------------------------------------
@app.route('/api/settlements', methods=['GET', 'POST'])
def api_settlements():
    if request.method == 'GET':
        group_id = request.args.get('group_id', type=int)
        if not group_id:
            return jsonify({'error': 'group_id is required.'}), 400
        settlements = db.get_settlements(group_id)
        return jsonify({'settlements': settlements}), 200

    data = request.get_json(silent=True) or request.form
    try:
        group_id = int(data.get('group_id'))
        from_member = int(data.get('from_member'))
        to_member = int(data.get('to_member'))
        amount = float(data.get('amount', 0))
        date = str(data.get('date', datetime.now().strftime('%Y-%m-%d'))).strip()
        notes = str(data.get('notes', '')).strip()

        if from_member == to_member:
            return jsonify({'error': 'Payer and receiver cannot be the same person.'}), 400
        if amount <= 0:
            return jsonify({'error': 'Settlement amount must be positive.'}), 400

        sid = db.add_settlement(group_id, from_member, to_member, amount, date, notes)
        return jsonify({'success': True, 'settlement_id': sid, 'message': 'Settlement recorded.'}), 201
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400

@app.route('/api/settlements/<int:settlement_id>', methods=['DELETE'])
def api_delete_settlement(settlement_id):
    deleted = db.delete_settlement(settlement_id)
    if not deleted:
        return jsonify({'error': 'Settlement not found.'}), 404
    return jsonify({'success': True, 'message': 'Settlement deleted.'}), 200

# -------------------------------------------------------------
# Financial Calculations & Dashboard Summary API
# -------------------------------------------------------------
@app.route('/api/balances', methods=['GET'])
def api_balances():
    group_id = request.args.get('group_id', type=int)
    if not group_id:
        return jsonify({'error': 'group_id parameter is required.'}), 400

    data = settlement_svc.calculate_group_balances(group_id)
    return jsonify(data), 200

@app.route('/api/settlement', methods=['GET'])
def api_settlement_plan():
    group_id = request.args.get('group_id', type=int)
    if not group_id:
        return jsonify({'error': 'group_id parameter is required.'}), 400

    balances_data = settlement_svc.calculate_group_balances(group_id)
    plan = settlement_svc.generate_settlement_plan(balances_data['members'])
    return jsonify({
        'settlement_plan': plan,
        'balances': balances_data['members']
    }), 200

@app.route('/api/category-summary', methods=['GET'])
def api_category_summary():
    group_id = request.args.get('group_id', type=int)
    if not group_id:
        return jsonify({'error': 'group_id parameter is required.'}), 400

    summary = db.get_category_summary(group_id)
    return jsonify(summary), 200

@app.route('/api/transactions', methods=['GET'])
def api_transactions():
    group_id = request.args.get('group_id', type=int)
    if not group_id:
        return jsonify({'error': 'group_id parameter is required.'}), 400

    txn_type = request.args.get('type', 'all')
    search = request.args.get('search')
    category = request.args.get('category')
    member_id = request.args.get('member_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')

    txns = db.get_unified_transactions(group_id, txn_type, search, category, member_id, start_date, end_date)
    return jsonify({'transactions': txns}), 200

@app.route('/api/dashboard', methods=['GET'])
def api_dashboard():
    group_id = request.args.get('group_id', type=int)
    if not group_id:
        groups = db.get_groups()
        if groups:
            group_id = groups[0]['id']
        else:
            return jsonify({'error': 'No groups exist.'}), 400

    balances_data = settlement_svc.calculate_group_balances(group_id)
    cat_summary = db.get_category_summary(group_id)
    recent_txns = db.get_unified_transactions(group_id)[:6]

    return jsonify({
        'group_id': group_id,
        'summary': balances_data['summary'],
        'members': balances_data['members'],
        'categories': cat_summary['categories'],
        'recent_transactions': recent_txns
    }), 200

# -------------------------------------------------------------
# Personal Expense Tracker API
# -------------------------------------------------------------
@app.route('/api/personal/transactions', methods=['GET', 'POST'])
def api_personal_transactions():
    if request.method == 'GET':
        month = request.args.get('month')
        tx_type = request.args.get('type')
        category = request.args.get('category')
        search = request.args.get('search')
        txns = db.get_personal_transactions(month, tx_type, category, search)
        return jsonify({'transactions': txns}), 200

    data = request.get_json(silent=True) or request.form
    try:
        tx_type = str(data.get('type', 'expense')).lower()
        title = str(data.get('title', '')).strip()
        amount = float(data.get('amount', 0))
        category = str(data.get('category', '')).strip()
        payment_method = str(data.get('payment_method', 'UPI')).strip()
        date = str(data.get('date', '')).strip() or datetime.now().strftime('%Y-%m-%d')
        notes = str(data.get('notes', '')).strip()

        if not title:
            return jsonify({'error': 'Title is required.'}), 400
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than zero.'}), 400

        # AI auto-categorization fallback
        if not category:
            pred = ai_svc.predict_category(title)
            category = pred.get('category', 'Other')

        tx_id = db.add_personal_transaction(tx_type, title, amount, category, payment_method, date, notes)
        tx = db.get_personal_transaction_by_id(tx_id)
        return jsonify({'success': True, 'transaction': tx}), 201
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid input: {str(e)}'}), 400
    except Exception as e:
        print(f"Error adding personal transaction: {e}")
        return jsonify({'error': 'Failed to save transaction.'}), 500

@app.route('/api/personal/transactions/<int:tx_id>', methods=['GET', 'PUT', 'DELETE'])
def api_personal_transaction_detail(tx_id):
    if request.method == 'GET':
        tx = db.get_personal_transaction_by_id(tx_id)
        if not tx:
            return jsonify({'error': 'Transaction not found.'}), 404
        return jsonify({'transaction': tx}), 200

    if request.method == 'PUT':
        data = request.get_json(silent=True) or request.form
        try:
            tx_type = str(data.get('type', 'expense')).lower()
            title = str(data.get('title', '')).strip()
            amount = float(data.get('amount', 0))
            category = str(data.get('category', '')).strip()
            payment_method = str(data.get('payment_method', 'UPI')).strip()
            date = str(data.get('date', '')).strip() or datetime.now().strftime('%Y-%m-%d')
            notes = str(data.get('notes', '')).strip()

            if not title:
                return jsonify({'error': 'Title is required.'}), 400
            if amount <= 0:
                return jsonify({'error': 'Amount must be greater than zero.'}), 400
            if not category:
                category = 'Other'

            updated = db.update_personal_transaction(tx_id, tx_type, title, amount, category, payment_method, date, notes)
            if not updated:
                return jsonify({'error': 'Transaction not found.'}), 404
            tx = db.get_personal_transaction_by_id(tx_id)
            return jsonify({'success': True, 'transaction': tx}), 200
        except (ValueError, TypeError) as e:
            return jsonify({'error': f'Invalid input: {str(e)}'}), 400

    if request.method == 'DELETE':
        deleted = db.delete_personal_transaction(tx_id)
        if not deleted:
            return jsonify({'error': 'Transaction not found.'}), 404
        return jsonify({'success': True, 'message': 'Transaction deleted.'}), 200

@app.route('/api/personal/summary', methods=['GET'])
def api_personal_summary():
    month = request.args.get('month') or datetime.now().strftime('%Y-%m')
    summary = db.get_personal_summary(month)
    return jsonify(summary), 200

@app.route('/api/personal/budget', methods=['GET', 'POST'])
def api_personal_budget():
    if request.method == 'GET':
        month = request.args.get('month') or datetime.now().strftime('%Y-%m')
        amount = db.get_personal_budget(month)
        return jsonify({'month': month, 'budget_amount': amount}), 200

    data = request.get_json(silent=True) or request.form
    month = str(data.get('month', '')).strip() or datetime.now().strftime('%Y-%m')
    try:
        amount = float(data.get('budget_amount', 0))
        db.set_personal_budget(month, amount)
        return jsonify({'success': True, 'month': month, 'budget_amount': amount}), 200
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid budget amount: {str(e)}'}), 400

@app.route('/api/personal/export', methods=['GET'])
def api_personal_export():
    import csv
    import io
    month = request.args.get('month') or datetime.now().strftime('%Y-%m')
    txns = db.get_personal_transactions(month=month)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Date', 'Type', 'Title', 'Category', 'Amount', 'Payment Method', 'Notes'])
    for t in txns:
        writer.writerow([t['id'], t['date'], t['type'], t['title'], t['category'], t['amount'], t.get('payment_method', ''), t.get('notes', '')])

    csv_data = output.getvalue()
    return Response(
        csv_data,
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename=personal_transactions_{month}.csv'}
    )

# -------------------------------------------------------------
# Global Error Handlers
# -------------------------------------------------------------
@app.errorhandler(404)
def not_found(error):
    if request.path.startswith('/api/') or request.is_json:
        return jsonify({'error': 'Resource not found.'}), 404
    return render_template('base.html', not_found=True), 404

@app.errorhandler(500)
def server_error(error):
    return jsonify({'error': 'Internal server error occurred.'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"\nStarting WorkSplit AI on port {port}...")
    print(f"Local access:   http://127.0.0.1:{port}")
    print(f"Network access: http://0.0.0.0:{port} (accessible across network)\n")
    app.run(host='0.0.0.0', port=port, debug=False)

