// =========================================================
// Personal Expense Tracker JavaScript
// =========================================================

let categoryChartInstance = null;
let trendChartInstance = null;
let currentMonth = '';
let allTransactions = [];
let aiDebounceTimer = null;

const CATEGORY_COLORS = {
    'Food': '#f97316',
    'Transportation': '#0284c7',
    'Work': '#4f46e5',
    'Shopping': '#8b5cf6',
    'Bills': '#ef4444',
    'Entertainment': '#ec4899',
    'Healthcare': '#10b981',
    'Education': '#14b8a6',
    'Salary': '#059669',
    'Freelance': '#0d9488',
    'Investment': '#6366f1',
    'Gift': '#e11d48',
    'Business': '#2563eb',
    'Other': '#64748b'
};

document.addEventListener('DOMContentLoaded', () => {
    initMonth();
    setupEventListeners();
    loadPersonalData();
});

// -------------------------------------------------------------
// Month Navigation & State
// -------------------------------------------------------------
function initMonth() {
    const monthInput = document.getElementById('selectedMonthInput');
    if (monthInput && monthInput.value) {
        currentMonth = monthInput.value;
    } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        currentMonth = `${year}-${month}`;
        if (monthInput) monthInput.value = currentMonth;
    }
}

function changeMonth(offset) {
    const [yearStr, monthStr] = currentMonth.split('-');
    let year = parseInt(yearStr, 10);
    let month = parseInt(monthStr, 10) + offset;

    if (month < 1) {
        month = 12;
        year -= 1;
    } else if (month > 12) {
        month = 1;
        year += 1;
    }

    currentMonth = `${year}-${String(month).padStart(2, '0')}`;
    const monthInput = document.getElementById('selectedMonthInput');
    if (monthInput) monthInput.value = currentMonth;
    loadPersonalData();
}

function resetToCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    currentMonth = `${year}-${month}`;
    const monthInput = document.getElementById('selectedMonthInput');
    if (monthInput) monthInput.value = currentMonth;
    loadPersonalData();
}

// -------------------------------------------------------------
// Event Listeners Setup
// -------------------------------------------------------------
function setupEventListeners() {
    // Month navigation
    document.getElementById('btnPrevMonth')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('btnNextMonth')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('btnCurrentMonth')?.addEventListener('click', resetToCurrentMonth);
    document.getElementById('selectedMonthInput')?.addEventListener('change', (e) => {
        if (e.target.value) {
            currentMonth = e.target.value;
            loadPersonalData();
        }
    });

    // Quick Action buttons
    document.getElementById('btnOpenAddExpenseModal')?.addEventListener('click', () => openTxModal('expense'));
    document.getElementById('btnOpenAddIncomeModal')?.addEventListener('click', () => openTxModal('income'));
    document.getElementById('btnOpenBudgetModal')?.addEventListener('click', openBudgetModal);
    document.getElementById('btnExportCSV')?.addEventListener('click', exportCSV);

    // Filters
    document.getElementById('txSearchInput')?.addEventListener('input', applyLocalFilters);
    document.getElementById('txTypeFilter')?.addEventListener('change', applyLocalFilters);
    document.getElementById('txCategoryFilter')?.addEventListener('change', applyLocalFilters);
    document.getElementById('btnResetFilters')?.addEventListener('click', () => {
        document.getElementById('txSearchInput').value = '';
        document.getElementById('txTypeFilter').value = 'all';
        document.getElementById('txCategoryFilter').value = 'all';
        applyLocalFilters();
    });

    // Transaction Modal Controls
    document.getElementById('btnCloseTxModal')?.addEventListener('click', closeTxModal);
    document.getElementById('btnCancelTxModal')?.addEventListener('click', closeTxModal);
    document.getElementById('txModalBackdrop')?.addEventListener('click', closeTxModal);

    // Type toggles in Modal
    document.getElementById('btnTypeExpense')?.addEventListener('click', () => setModalType('expense'));
    document.getElementById('btnTypeIncome')?.addEventListener('click', () => setModalType('income'));

    // Real-time AI prediction on title input
    document.getElementById('txTitle')?.addEventListener('input', handleTitleInputAI);
    document.getElementById('btnApplyAiCat')?.addEventListener('click', applyAiSuggestedCategory);

    // Form Submissions
    document.getElementById('txForm')?.addEventListener('submit', handleTxFormSubmit);
    document.getElementById('budgetForm')?.addEventListener('submit', handleBudgetFormSubmit);

    // Quick Inline Form Submission
    document.getElementById('quickAddInlineForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('quickInlineTitle')?.value.trim();
        const amount = parseFloat(document.getElementById('quickInlineAmount')?.value);
        const category = document.getElementById('quickInlineCategory')?.value || 'Food';
        const type = document.getElementById('quickInlineType')?.value || 'expense';

        if (!title || isNaN(amount) || amount <= 0) {
            showToast('Please enter description and valid amount.', 'error');
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        try {
            const res = await fetch('/api/personal/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: type,
                    title: title,
                    amount: amount,
                    category: category,
                    payment_method: 'UPI',
                    date: today,
                    notes: ''
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to add transaction');

            document.getElementById('quickInlineTitle').value = '';
            document.getElementById('quickInlineAmount').value = '';
            showToast(`Added ${type === 'income' ? 'income' : 'expense'}: ₹${amount}!`, 'success');
            loadPersonalData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    // Budget Modal Close
    document.getElementById('btnCloseBudgetModal')?.addEventListener('click', closeBudgetModal);
    document.getElementById('btnCancelBudgetModal')?.addEventListener('click', closeBudgetModal);
    document.getElementById('budgetModalBackdrop')?.addEventListener('click', closeBudgetModal);
}

// -------------------------------------------------------------
// Load Personal Data (Summary & Transactions)
// -------------------------------------------------------------
async function loadPersonalData() {
    try {
        const [sumRes, txRes] = await Promise.all([
            fetch(`/api/personal/summary?month=${encodeURIComponent(currentMonth)}`),
            fetch(`/api/personal/transactions?month=${encodeURIComponent(currentMonth)}`)
        ]);

        if (!sumRes.ok || !txRes.ok) throw new Error('Failed to fetch personal tracker data');

        const summary = await sumRes.json();
        const txData = await txRes.json();

        allTransactions = txData.transactions || [];

        updateKPICards(summary);
        renderCharts(summary);
        applyLocalFilters();
    } catch (err) {
        console.error('Error loading personal data:', err);
        showToast('Error loading personal expense data.', 'error');
    }
}

// -------------------------------------------------------------
// Update KPI Cards
// -------------------------------------------------------------
function updateKPICards(summary) {
    const incomeEl = document.getElementById('kpi-personal-income');
    const expenseEl = document.getElementById('kpi-personal-expense');
    const savingsEl = document.getElementById('kpi-personal-savings');
    const budgetEl = document.getElementById('kpi-personal-budget');
    const savingsRateEl = document.getElementById('kpi-personal-savings-rate');

    const totalIncome = summary.total_income || 0;
    const totalExpense = summary.total_expense || 0;
    const netSavings = summary.net_savings || 0;
    const budget = summary.budget_amount || 0;
    const budgetRemaining = summary.budget_remaining || 0;
    const budgetPercent = summary.budget_percent || 0;

    if (incomeEl) incomeEl.textContent = `₹${totalIncome.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (expenseEl) expenseEl.textContent = `₹${totalExpense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    if (savingsEl) {
        savingsEl.textContent = `${netSavings >= 0 ? '+' : ''}₹${netSavings.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        savingsEl.style.color = netSavings >= 0 ? '#059669' : '#dc2626';
    }

    if (savingsRateEl) {
        if (totalIncome > 0) {
            const rate = Math.round((netSavings / totalIncome) * 100);
            savingsRateEl.textContent = `${rate}% savings rate`;
        } else {
            savingsRateEl.textContent = 'Income minus expenses';
        }
    }

    // Budget card
    if (budgetEl) {
        budgetEl.textContent = budget > 0 ? `₹${budget.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : 'No budget set';
    }

    const progBar = document.getElementById('budgetProgressBar');
    const progLabel = document.getElementById('budgetProgressLabel');
    const remLabel = document.getElementById('budgetRemainingLabel');

    if (progBar && progLabel && remLabel) {
        if (budget > 0) {
            const cappedPercent = Math.min(budgetPercent, 100);
            progBar.style.width = `${cappedPercent}%`;

            if (summary.is_over_budget) {
                progBar.style.backgroundColor = '#ef4444';
                progLabel.innerHTML = `<span style="color: #ef4444; font-weight: 700;">⚠️ ${budgetPercent}% (Over Budget)</span>`;
                remLabel.textContent = `Exceeded by ₹${Math.abs(budgetRemaining).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
            } else if (budgetPercent >= 80) {
                progBar.style.backgroundColor = '#f59e0b';
                progLabel.textContent = `${budgetPercent}% used`;
                remLabel.textContent = `₹${budgetRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })} left`;
            } else {
                progBar.style.backgroundColor = '#10b981';
                progLabel.textContent = `${budgetPercent}% used`;
                remLabel.textContent = `₹${budgetRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })} left`;
            }
        } else {
            progBar.style.width = '0%';
            progLabel.textContent = 'Click "Set Budget" to set target';
            remLabel.textContent = '';
        }
    }
}

// -------------------------------------------------------------
// Render Visual Charts (Category Doughnut & Daily Trend)
// -------------------------------------------------------------
function renderCharts(summary) {
    renderCategoryChart(summary.category_breakdown || []);
    renderTrendChart(summary.daily_spending || []);
}

function renderCategoryChart(categories) {
    const canvas = document.getElementById('personalCategoryChart');
    if (!canvas) return;

    if (categoryChartInstance) {
        categoryChartInstance.destroy();
        categoryChartInstance = null;
    }

    const badge = document.getElementById('categoryCountBadge');
    if (badge) badge.textContent = `${categories.length} categories`;

    if (categories.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No expenses recorded for this month', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = categories.map(c => c.category);
    const dataVals = categories.map(c => c.total);
    const colors = categories.map(c => CATEGORY_COLORS[c.category] || '#94a3b8');

    categoryChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataVals,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        font: { size: 12, family: 'sans-serif' },
                        generateLabels: (chart) => {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const meta = chart.getDatasetMeta(0);
                                    const ds = data.datasets[0];
                                    const val = ds.data[i];
                                    return {
                                        text: `${label} (₹${val.toLocaleString('en-IN')})`,
                                        fillStyle: ds.backgroundColor[i],
                                        hidden: isNaN(ds.data[i]) || meta.data[i].hidden,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw || 0;
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                            return ` ${ctx.label}: ₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (${pct}%)`;
                        }
                    }
                }
            },
            cutout: '62%'
        }
    });
}

function renderTrendChart(dailyData) {
    const canvas = document.getElementById('personalTrendChart');
    if (!canvas) return;

    if (trendChartInstance) {
        trendChartInstance.destroy();
        trendChartInstance = null;
    }

    if (dailyData.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No daily spending recorded yet', canvas.width / 2, canvas.height / 2);
        return;
    }

    const labels = dailyData.map(d => {
        const parts = d.date.split('-');
        return `${parts[2]}/${parts[1]}`;
    });
    const values = dailyData.map(d => d.total);

    trendChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Expenses (₹)',
                data: values,
                backgroundColor: 'rgba(37, 99, 235, 0.75)',
                borderColor: '#2563eb',
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: val => '₹' + val.toLocaleString('en-IN')
                    },
                    grid: {
                        color: 'rgba(226, 232, 240, 0.6)'
                    }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Spending: ₹${ctx.raw.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    }
                }
            }
        }
    });
}

// -------------------------------------------------------------
// Filter & Render Transactions Table
// -------------------------------------------------------------
function applyLocalFilters() {
    const search = (document.getElementById('txSearchInput')?.value || '').toLowerCase().trim();
    const typeFilter = document.getElementById('txTypeFilter')?.value || 'all';
    const catFilter = document.getElementById('txCategoryFilter')?.value || 'all';

    let filtered = allTransactions.filter(tx => {
        if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
        if (catFilter !== 'all' && tx.category !== catFilter) return false;
        if (search) {
            const titleMatch = (tx.title || '').toLowerCase().includes(search);
            const notesMatch = (tx.notes || '').toLowerCase().includes(search);
            const catMatch = (tx.category || '').toLowerCase().includes(search);
            const methodMatch = (tx.payment_method || '').toLowerCase().includes(search);
            if (!titleMatch && !notesMatch && !catMatch && !methodMatch) return false;
        }
        return true;
    });

    renderTransactionsTable(filtered);
}

function renderTransactionsTable(transactions) {
    const tbody = document.getElementById('personalTransactionsBody');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted" style="padding: 2.5rem 1rem;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">🍃</div>
                    <strong>No transactions found for this period.</strong>
                    <p style="font-size: 0.85rem; margin-top: 0.25rem;">Click "+ Add Expense" or "+ Add Income" above to log a transaction.</p>
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    transactions.forEach(tx => {
        const isIncome = tx.type === 'income';
        const amountSign = isIncome ? '+' : '-';
        const amountColor = isIncome ? '#059669' : '#dc2626';
        const typeBadge = isIncome
            ? '<span class="status-badge" style="background: #ecfdf5; color: #059669; font-size: 0.75rem; padding: 2px 8px; border-radius: 999px;">Income</span>'
            : '<span class="status-badge" style="background: #fef2f2; color: #dc2626; font-size: 0.75rem; padding: 2px 8px; border-radius: 999px;">Expense</span>';

        const catColor = CATEGORY_COLORS[tx.category] || '#64748b';

        html += `
            <tr data-id="${tx.id}">
                <td style="white-space: nowrap; font-size: 0.875rem; color: var(--text-secondary);">${escapeHtml(tx.date)}</td>
                <td>${typeBadge}</td>
                <td>
                    <strong style="color: var(--text-primary); font-size: 0.95rem;">${escapeHtml(tx.title)}</strong>
                    ${tx.notes ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(tx.notes)}</div>` : ''}
                </td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: ${catColor}15; color: ${catColor}; border: 1px solid ${catColor}30;">
                        <span style="width: 7px; height: 7px; border-radius: 50%; background: ${catColor};"></span>
                        ${escapeHtml(tx.category)}
                    </span>
                </td>
                <td>
                    <span style="font-size: 0.8rem; background: var(--bg-subtle); padding: 3px 8px; border-radius: var(--radius-sm); color: var(--text-secondary);">
                        ${escapeHtml(tx.payment_method || 'UPI')}
                    </span>
                </td>
                <td style="text-align: right; font-weight: 700; font-size: 0.95rem; color: ${amountColor}; white-space: nowrap;">
                    ${amountSign}₹${Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td style="text-align: center; white-space: nowrap;">
                    <button type="button" class="btn btn-outline btn-sm" onclick="editTransaction(${tx.id})" title="Edit" style="padding: 2px 7px; font-size: 0.8rem;">✏️</button>
                    <button type="button" class="btn btn-outline btn-sm" onclick="deleteTransaction(${tx.id})" title="Delete" style="padding: 2px 7px; font-size: 0.8rem; color: #dc2626;">🗑️</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// -------------------------------------------------------------
// Modal: Open & Switch Types
// -------------------------------------------------------------
function openTxModal(type = 'expense') {
    const modal = document.getElementById('txModal');
    const form = document.getElementById('txForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('txEditId').value = '';
    document.getElementById('txModalTitle').textContent = type === 'income' ? 'Add Personal Income' : 'Add Personal Expense';
    document.getElementById('btnSaveTx').textContent = 'Save Transaction';
    document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('txAiSuggestionPill')?.classList.add('hidden');

    setModalType(type);
    modal.classList.remove('hidden');
    document.getElementById('txTitle')?.focus();
}

function closeTxModal() {
    document.getElementById('txModal')?.classList.add('hidden');
}

function setModalType(type) {
    const isExpense = type === 'expense';
    document.getElementById('txType').value = type;

    const btnExp = document.getElementById('btnTypeExpense');
    const btnInc = document.getElementById('btnTypeIncome');
    const catSelect = document.getElementById('txCategory');

    if (btnExp && btnInc) {
        if (isExpense) {
            btnExp.style.background = '#ef4444';
            btnExp.style.color = '#ffffff';
            btnExp.style.borderColor = '#ef4444';

            btnInc.style.background = '#f8fafc';
            btnInc.style.color = '#475569';
            btnInc.style.borderColor = 'var(--border-color)';
        } else {
            btnInc.style.background = '#10b981';
            btnInc.style.color = '#ffffff';
            btnInc.style.borderColor = '#10b981';

            btnExp.style.background = '#f8fafc';
            btnExp.style.color = '#475569';
            btnExp.style.borderColor = 'var(--border-color)';
        }
    }

    // Adjust default category
    if (catSelect) {
        catSelect.value = isExpense ? 'Food' : 'Salary';
    }

    if (!isExpense) {
        document.getElementById('txAiSuggestionPill')?.classList.add('hidden');
    }
}

// -------------------------------------------------------------
// Real-Time AI Auto-Categorization on Typing
// -------------------------------------------------------------
function handleTitleInputAI(e) {
    const text = (e.target.value || '').trim();
    const type = document.getElementById('txType')?.value || 'expense';

    if (type !== 'expense' || text.length < 3) {
        document.getElementById('txAiSuggestionPill')?.classList.add('hidden');
        return;
    }

    clearTimeout(aiDebounceTimer);
    aiDebounceTimer = setTimeout(async () => {
        try {
            const res = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: text })
            });
            if (!res.ok) return;
            const pred = await res.json();

            if (pred && pred.category) {
                const pill = document.getElementById('txAiSuggestionPill');
                const catSpan = document.getElementById('txAiSuggestedCat');
                const confSpan = document.getElementById('txAiConfidence');

                if (pill && catSpan && confSpan) {
                    catSpan.textContent = pred.category;
                    confSpan.textContent = `${pred.confidence_percent}%`;
                    pill.classList.remove('hidden');
                }
            }
        } catch (err) {
            // Silently ignore AI prediction errors
        }
    }, 350);
}

function applyAiSuggestedCategory() {
    const cat = document.getElementById('txAiSuggestedCat')?.textContent;
    const catSelect = document.getElementById('txCategory');
    if (cat && catSelect) {
        catSelect.value = cat;
        showToast(`Selected category: ${cat}`);
    }
}

// -------------------------------------------------------------
// Transaction Submit (Add / Edit)
// -------------------------------------------------------------
async function handleTxFormSubmit(e) {
    e.preventDefault();
    const editId = document.getElementById('txEditId')?.value;
    const type = document.getElementById('txType')?.value || 'expense';
    const title = document.getElementById('txTitle')?.value.trim();
    const amount = parseFloat(document.getElementById('txAmount')?.value);
    const category = document.getElementById('txCategory')?.value;
    const paymentMethod = document.getElementById('txPaymentMethod')?.value;
    const date = document.getElementById('txDate')?.value;
    const notes = document.getElementById('txNotes')?.value.trim();

    if (!title) {
        showToast('Please enter a title or description.', 'error');
        return;
    }
    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid amount greater than 0.', 'error');
        return;
    }
    if (!date) {
        showToast('Please choose a date.', 'error');
        return;
    }

    const payload = {
        type: type,
        title: title,
        amount: amount,
        category: category,
        payment_method: paymentMethod,
        date: date,
        notes: notes
    };

    try {
        const url = editId ? `/api/personal/transactions/${editId}` : '/api/personal/transactions';
        const method = editId ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to save transaction');

        closeTxModal();
        showToast(editId ? 'Transaction updated successfully!' : 'Transaction recorded successfully!', 'success');
        loadPersonalData();
    } catch (err) {
        console.error('Error saving transaction:', err);
        showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// Edit Transaction
// -------------------------------------------------------------
async function editTransaction(id) {
    try {
        const res = await fetch(`/api/personal/transactions/${id}`);
        if (!res.ok) throw new Error('Transaction not found');
        const tx = await res.json();

        openTxModal(tx.type);
        document.getElementById('txEditId').value = tx.id;
        document.getElementById('txModalTitle').textContent = 'Edit Transaction';
        document.getElementById('btnSaveTx').textContent = 'Update Transaction';

        document.getElementById('txTitle').value = tx.title;
        document.getElementById('txAmount').value = tx.amount;
        document.getElementById('txDate').value = tx.date;
        document.getElementById('txCategory').value = tx.category;
        document.getElementById('txPaymentMethod').value = tx.payment_method || 'UPI';
        document.getElementById('txNotes').value = tx.notes || '';
    } catch (err) {
        showToast('Error opening transaction for edit', 'error');
    }
}

// -------------------------------------------------------------
// Delete Transaction
// -------------------------------------------------------------
async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
        const res = await fetch(`/api/personal/transactions/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete transaction');

        showToast('Transaction deleted successfully.');
        loadPersonalData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// Monthly Budget Modal & Submit
// -------------------------------------------------------------
async function openBudgetModal() {
    const modal = document.getElementById('budgetModal');
    if (!modal) return;

    const [year, month] = currentMonth.split('-');
    const dateObj = new Date(year, month - 1, 1);
    const monthName = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    document.getElementById('budgetModalMonthName').textContent = monthName;

    try {
        const res = await fetch(`/api/personal/budget?month=${encodeURIComponent(currentMonth)}`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('inputBudgetAmount').value = data.budget_amount > 0 ? data.budget_amount : '';
        }
    } catch (err) {}

    modal.classList.remove('hidden');
    document.getElementById('inputBudgetAmount')?.focus();
}

function closeBudgetModal() {
    document.getElementById('budgetModal')?.classList.add('hidden');
}

async function handleBudgetFormSubmit(e) {
    e.preventDefault();
    const amountVal = parseFloat(document.getElementById('inputBudgetAmount')?.value);
    if (isNaN(amountVal) || amountVal < 0) {
        showToast('Please enter a valid budget amount.', 'error');
        return;
    }

    try {
        const res = await fetch('/api/personal/budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                month: currentMonth,
                budget_amount: amountVal
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to set budget');

        closeBudgetModal();
        showToast('Monthly budget updated!', 'success');
        loadPersonalData();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// -------------------------------------------------------------
// Export CSV
// -------------------------------------------------------------
function exportCSV() {
    window.location.href = `/api/personal/export?month=${encodeURIComponent(currentMonth)}`;
}

// -------------------------------------------------------------
// Helper: HTML Escape
// -------------------------------------------------------------
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
