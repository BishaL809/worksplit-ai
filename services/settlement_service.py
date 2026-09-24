from typing import List, Dict, Any
from .database_service import get_connection, get_members

def calculate_group_balances(group_id: int) -> Dict[str, Any]:
    """
    Computes exact, deterministic financial balances for all group members.
    Formula for each member:
      Net Balance = (Total Earned - Physically Received)
                  + (Personally Paid - Expense Share)
                  + (Settlements Paid - Settlements Received)
    """
    members = get_members(group_id)
    if not members:
        return {'members': [], 'summary': {'total_income': 0, 'total_expenses': 0, 'remaining': 0}}

    member_map = {m['id']: m['name'] for m in members}
    stats = {}

    for m_id, name in member_map.items():
        stats[m_id] = {
            'member_id': m_id,
            'name': name,
            'total_earned': 0.0,
            'physically_received': 0.0,
            'personally_paid': 0.0,
            'expense_share': 0.0,
            'settlements_paid': 0.0,
            'settlements_received': 0.0,
            'net_balance': 0.0,
            'status': 'Settled'
        }

    with get_connection() as conn:
        cursor = conn.cursor()

        # 1. Total Earned (from work payment shares)
        cursor.execute('''
            SELECT wps.member_id, COALESCE(SUM(wps.share_amount), 0) as total_earned
            FROM work_payment_shares wps
            JOIN work_payments wp ON wps.payment_id = wp.id
            WHERE wp.group_id = ?
            GROUP BY wps.member_id
        ''', (group_id,))
        for row in cursor.fetchall():
            if row['member_id'] in stats:
                stats[row['member_id']]['total_earned'] = float(row['total_earned'])

        # 2. Physically Received (work payments received directly by this member)
        cursor.execute('''
            SELECT received_by, COALESCE(SUM(amount), 0) as total_received
            FROM work_payments
            WHERE group_id = ?
            GROUP BY received_by
        ''', (group_id,))
        for row in cursor.fetchall():
            if row['received_by'] in stats:
                stats[row['received_by']]['physically_received'] = float(row['total_received'])

        # 3. Personally Paid Expenses (expenses paid out of pocket by this member)
        cursor.execute('''
            SELECT paid_by, COALESCE(SUM(amount), 0) as total_paid
            FROM expenses
            WHERE group_id = ?
            GROUP BY paid_by
        ''', (group_id,))
        for row in cursor.fetchall():
            if row['paid_by'] in stats:
                stats[row['paid_by']]['personally_paid'] = float(row['total_paid'])

        # 4. Personal Expense Share (this member's assigned share in expenses)
        cursor.execute('''
            SELECT es.member_id, COALESCE(SUM(es.share_amount), 0) as total_share
            FROM expense_shares es
            JOIN expenses e ON es.expense_id = e.id
            WHERE e.group_id = ?
            GROUP BY es.member_id
        ''', (group_id,))
        for row in cursor.fetchall():
            if row['member_id'] in stats:
                stats[row['member_id']]['expense_share'] = float(row['total_share'])

        # 5. Settlements Paid (direct transfers paid to another member)
        cursor.execute('''
            SELECT from_member, COALESCE(SUM(amount), 0) as total_settled_paid
            FROM settlements
            WHERE group_id = ?
            GROUP BY from_member
        ''', (group_id,))
        for row in cursor.fetchall():
            if row['from_member'] in stats:
                stats[row['from_member']]['settlements_paid'] = float(row['total_settled_paid'])

        # 6. Settlements Received (direct transfers received from another member)
        cursor.execute('''
            SELECT to_member, COALESCE(SUM(amount), 0) as total_settled_received
            FROM settlements
            WHERE group_id = ?
            GROUP BY to_member
        ''', (group_id,))
        for row in cursor.fetchall():
            if row['to_member'] in stats:
                stats[row['to_member']]['settlements_received'] = float(row['total_settled_received'])

    # Compute Net Balances and Status
    member_balances = []
    total_income = 0.0
    total_expenses = 0.0

    for m_id, item in stats.items():
        # Core deterministic balance equation
        income_delta = item['total_earned'] - item['physically_received']
        expense_delta = item['personally_paid'] - item['expense_share']
        settlement_delta = item['settlements_paid'] - item['settlements_received']

        net = round(income_delta + expense_delta + settlement_delta, 2)
        item['net_balance'] = net

        if net > 0.009:
            item['status'] = 'Should Receive'
        elif net < -0.009:
            item['status'] = 'Needs to Pay'
        else:
            item['status'] = 'Settled'
            item['net_balance'] = 0.0

        total_income += item['physically_received']
        total_expenses += item['personally_paid']

        member_balances.append(item)

    # Sort so creditors/debtors are grouped nicely
    member_balances.sort(key=lambda x: x['net_balance'], reverse=True)

    return {
        'members': member_balances,
        'summary': {
            'total_income': round(total_income, 2),
            'total_expenses': round(total_expenses, 2),
            'remaining_balance': round(total_income - total_expenses, 2),
            'member_count': len(members)
        }
    }

def generate_settlement_plan(balances: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Min-cash-flow greedy algorithm:
    Matches debtors with creditors to clear all debts in minimal transactions.
    """
    # Creditors (net_balance > 0)
    creditors = []
    # Debtors (net_balance < 0)
    debtors = []

    for b in balances:
        val = b['net_balance']
        if val > 0.009:
            creditors.append({
                'member_id': b['member_id'],
                'name': b['name'],
                'amount': round(val, 2)
            })
        elif val < -0.009:
            debtors.append({
                'member_id': b['member_id'],
                'name': b['name'],
                'amount': round(abs(val), 2)
            })

    # Sort descending by magnitude
    creditors.sort(key=lambda x: x['amount'], reverse=True)
    debtors.sort(key=lambda x: x['amount'], reverse=True)

    settlement_transfers = []
    i = 0  # debtor index
    j = 0  # creditor index

    while i < len(debtors) and j < len(creditors):
        debtor = debtors[i]
        creditor = creditors[j]

        transfer_amt = min(debtor['amount'], creditor['amount'])
        transfer_amt = round(transfer_amt, 2)

        if transfer_amt > 0.009:
            settlement_transfers.append({
                'from_member_id': debtor['member_id'],
                'from_name': debtor['name'],
                'to_member_id': creditor['member_id'],
                'to_name': creditor['name'],
                'amount': transfer_amt
            })

        debtor['amount'] = round(debtor['amount'] - transfer_amt, 2)
        creditor['amount'] = round(creditor['amount'] - transfer_amt, 2)

        if debtor['amount'] <= 0.009:
            i += 1
        if creditor['amount'] <= 0.009:
            j += 1

    return settlement_transfers
