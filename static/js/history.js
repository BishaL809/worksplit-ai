// =========================================================
// WorkSplit AI - Unified Transaction History
// =========================================================

let searchDebounce = null;

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryMembers();
    loadTransactions();
    setupHistoryEventListeners();
    window.addEventListener('activeGroupChanged', () => {
        loadHistoryMembers();
        loadTransactions();
    });
});

async function loadHistoryMembers() {
    const groupId = getActiveGroupId();
    const select = document.getElementById('historyMemberFilter');
    const editPaidBy = document.getElementById('editExpensePaidBy');
    if (!select || !groupId) return;

    try {
        const res = await fetch(`/api/groups/${groupId}/members`);
        const data = await res.json();
        const members = data.members || [];

        select.innerHTML = '<option value="">All Members</option>';
        if (editPaidBy) editPaidBy.innerHTML = '';

        members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            select.appendChild(opt);

            if (editPaidBy) {
                const opt2 = document.createElement('option');
                opt2.value = m.id;
                opt2.textContent = m.name;
                editPaidBy.appendChild(opt2);
            }
        });
    } catch (err) {
        console.error('Error loading members for history:', err);
    }
}

async function loadTransactions() {
    const groupId = getActiveGroupId();
    const tbody = document.getElementById('historyTableBody');
    if (!tbody || !groupId) return;

    const search = document.getElementById('historySearch')?.value.trim() || '';
    const type = document.getElementById('historyTypeFilter')?.value || 'all';
    const category = document.getElementById('historyCategoryFilter')?.value || 'all';
    const memberId = document.getElementById('historyMemberFilter')?.value || '';
    const startDate = document.getElementById('historyStartDate')?.value || '';
    const endDate = document.getElementById('historyEndDate')?.value || '';

    const params = new URLSearchParams({ group_id: groupId, type });
    if (search) params.append('search', search);
    if (category && category !== 'all') params.append('category', category);
    if (memberId) params.append('member_id', memberId);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    try {
        const res = await fetch(`/api/transactions?${params.toString()}`);
        const data = await res.json();
        const txns = data.transactions || [];

        renderTransactionsTable(txns);
        updateHistorySummaryBar(txns);
    } catch (err) {
        console.error('Error fetching transactions:', err);
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Error loading transactions.</td></tr>';
    }
}

function renderTransactionsTable(txns) {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;

    if (txns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No transactions found matching the filter criteria.</td></tr>';
        return;
    }

    tbody.innerHTML = txns.map(t => {
        let typeBadgeClass = 'type-badge-expense';
        if (t.type === 'WORK PAYMENT') typeBadgeClass = 'type-badge-payment';
        else if (t.type === 'SETTLEMENT') typeBadgeClass = 'type-badge-settlement';

        const baseBadgeClass = t.category.startsWith('Other') ? 'Other' : t.category;
        const participantStr = (t.participants || []).join(', ');

        return `
            <tr>
                <td class="text-muted">${escapeHtml(t.date)}</td>
                <td><span class="type-badge ${typeBadgeClass}">${t.type}</span></td>
                <td><strong>${escapeHtml(t.description)}</strong></td>
                <td><span class="badge badge-${escapeHtml(baseBadgeClass)}">${escapeHtml(t.category)}</span></td>
                <td>${escapeHtml(t.primary_person)} <span class="text-muted" style="font-size: 0.75rem;">(${t.primary_role})</span></td>
                <td><strong>₹${parseFloat(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                <td style="font-size: 0.8125rem;">${escapeHtml(participantStr)}</td>
                <td class="text-right">
                    <div class="action-buttons">
                        ${t.type === 'EXPENSE' ? `<button class="btn btn-secondary btn-sm" onclick="openEditExpenseModal(${t.id})">Edit</button>` : ''}
                        <button class="btn btn-danger-outline btn-sm" onclick="deleteHistoryTransaction('${t.type}', ${t.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateHistorySummaryBar(txns) {
    const countElem = document.getElementById('filterMatchCount');
    const totalElem = document.getElementById('filterTotalAmount');

    const total = txns.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    if (countElem) countElem.textContent = txns.length;
    if (totalElem) totalElem.textContent = `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

function setupHistoryEventListeners() {
    const searchInp = document.getElementById('historySearch');
    if (searchInp) {
        searchInp.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(loadTransactions, 300);
        });
    }

    ['historyTypeFilter', 'historyCategoryFilter', 'historyMemberFilter', 'historyStartDate', 'historyEndDate'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', loadTransactions);
    });

    document.getElementById('btnResetHistoryFilters')?.addEventListener('click', () => {
        if (searchInp) searchInp.value = '';
        document.getElementById('historyTypeFilter').value = 'all';
        document.getElementById('historyCategoryFilter').value = 'all';
        document.getElementById('historyMemberFilter').value = '';
        document.getElementById('historyStartDate').value = '';
        document.getElementById('historyEndDate').value = '';
        loadTransactions();
    });

    // Edit Modal Close Handlers
    const modal = document.getElementById('editExpenseModal');
    const btnClose = document.getElementById('btnCloseEditExpenseModal');
    const btnCancel = document.getElementById('btnCancelExpenseEdit');
    const backdrop = document.getElementById('modalEditExpenseBackdrop');
    const form = document.getElementById('editExpenseForm');

    [btnClose, btnCancel, backdrop].forEach(el => {
        el?.addEventListener('click', () => modal?.classList.add('hidden'));
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editExpenseId').value;
            const desc = document.getElementById('editExpenseDesc').value.trim();
            const amount = parseFloat(document.getElementById('editExpenseAmount').value);
            const date = document.getElementById('editExpenseDate').value;
            const category = document.getElementById('editExpenseCategory').value;
            const paidBy = parseInt(document.getElementById('editExpensePaidBy').value);

            // Fetch current expense to preserve its shares proportionally
            try {
                const getRes = await fetch(`/api/expenses/${id}`);
                const getData = await getRes.json();
                const exp = getData.expense;

                const sharesDict = {};
                if (exp && exp.shares && exp.shares.length > 0) {
                    const perPerson = amount / exp.shares.length;
                    exp.shares.forEach(s => {
                        sharesDict[s.member_id] = perPerson;
                    });
                } else {
                    sharesDict[paidBy] = amount;
                }

                const res = await fetch(`/api/expenses/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        description: desc,
                        amount: amount,
                        paid_by: paidBy,
                        category: category,
                        date: date,
                        split_method: 'equal',
                        shares: sharesDict
                    })
                });

                if (!res.ok) throw new Error('Failed to update expense');
                showToast('Expense updated successfully.');
                modal?.classList.add('hidden');
                loadTransactions();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }
}

async function openEditExpenseModal(expenseId) {
    try {
        const res = await fetch(`/api/expenses/${expenseId}`);
        const data = await res.json();
        const exp = data.expense;
        if (!exp) return;

        document.getElementById('editExpenseId').value = exp.id;
        document.getElementById('editExpenseDesc').value = exp.description;
        document.getElementById('editExpenseAmount').value = exp.amount;
        document.getElementById('editExpenseDate').value = exp.date;
        document.getElementById('editExpenseCategory').value = exp.category.startsWith('Other') ? 'Other' : exp.category;
        document.getElementById('editExpensePaidBy').value = exp.paid_by;

        document.getElementById('editExpenseModal')?.classList.remove('hidden');
    } catch (err) {
        showToast('Error loading expense details', 'error');
    }
}

async function deleteHistoryTransaction(type, id) {
    if (!confirm(`Are you sure you want to delete this ${type.toLowerCase()} record? Balances will be recalculated.`)) return;

    let endpoint = '';
    if (type === 'WORK PAYMENT') endpoint = `/api/payments/${id}`;
    else if (type === 'EXPENSE') endpoint = `/api/expenses/${id}`;
    else if (type === 'SETTLEMENT') endpoint = `/api/settlements/${id}`;

    try {
        const res = await fetch(endpoint, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete transaction');

        showToast('Record deleted. Balances updated.');
        loadTransactions();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
