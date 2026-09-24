// =========================================================
// WorkSplit AI - Group Expenses & AI NLP Assistant
// =========================================================

let currentGroupMembers = [];
let predictDebounceTimer = null;
let lastAIPredictedCategory = null;

document.addEventListener('DOMContentLoaded', () => {
    loadExpensesPage();
    setupExpenseEventListeners();
    window.addEventListener('activeGroupChanged', loadExpensesPage);
});

async function loadExpensesPage() {
    const groupId = getActiveGroupId();
    if (!groupId) return;

    try {
        const memRes = await fetch(`/api/groups/${groupId}/members`);
        const memData = await memRes.json();
        currentGroupMembers = memData.members || [];

        populatePayersDropdown(currentGroupMembers);
        renderExpenseSharesTable();
        loadExistingExpenses(groupId);
    } catch (err) {
        console.error('Error loading expenses page:', err);
    }
}

function populatePayersDropdown(members) {
    const select = document.getElementById('expensePaidBy');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Who paid for this?</option>';
    members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        select.appendChild(opt);
    });
}

function renderExpenseSharesTable() {
    const tbody = document.getElementById('expenseSharesBody');
    if (!tbody) return;

    if (currentGroupMembers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No members in this group. Please add members first!</td></tr>';
        return;
    }

    const splitMethod = document.querySelector('input[name="expenseSplitMethod"]:checked')?.value || 'equal';
    const header = document.getElementById('expenseShareColHeader');
    if (header) {
        if (splitMethod === 'percentage') header.textContent = 'Share (%) & Amount';
        else header.textContent = 'Share Amount (₹)';
    }

    tbody.innerHTML = currentGroupMembers.map(m => `
        <tr data-member-id="${m.id}">
            <td>
                <input type="checkbox" class="expense-member-checkbox" data-id="${m.id}" checked>
            </td>
            <td><strong>${escapeHtml(m.name)}</strong></td>
            <td class="share-input-cell">
                ${renderExpenseShareInput(m.id, splitMethod)}
            </td>
        </tr>
    `).join('');

    attachExpenseShareListeners();
    recalculateExpenseShares();
}

function renderExpenseShareInput(memberId, method) {
    if (method === 'equal') {
        return `<span class="calculated-share-val" id="calc-expense-share-${memberId}">₹0.00</span>`;
    } else if (method === 'percentage') {
        return `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input type="number" class="form-control form-control-sm expense-percentage-input" data-id="${memberId}" style="width: 80px;" min="0" max="100" step="0.1" value="0">
                <span class="calculated-share-val" id="calc-expense-share-${memberId}">₹0.00</span>
            </div>
        `;
    } else {
        return `
            <div class="input-currency-wrapper">
                <span class="currency-symbol" style="left: 0.5rem; font-size: 0.8rem;">₹</span>
                <input type="number" class="form-control form-control-sm expense-custom-input with-prefix" data-id="${memberId}" style="width: 120px;" min="0" step="0.01" value="0.00">
            </div>
        `;
    }
}

function attachExpenseShareListeners() {
    const checkboxes = document.querySelectorAll('.expense-member-checkbox');
    checkboxes.forEach(cb => cb.addEventListener('change', recalculateExpenseShares));

    const inputs = document.querySelectorAll('.expense-percentage-input, .expense-custom-input');
    inputs.forEach(inp => inp.addEventListener('input', recalculateExpenseShares));
}

function recalculateExpenseShares() {
    const totalAmount = parseFloat(document.getElementById('expenseAmount')?.value) || 0;
    const splitMethod = document.querySelector('input[name="expenseSplitMethod"]:checked')?.value || 'equal';
    const checkboxes = Array.from(document.querySelectorAll('.expense-member-checkbox'));
    const checkedMembers = checkboxes.filter(cb => cb.checked);
    const checkedCount = checkedMembers.length;

    let computedShares = {};
    let sharesSum = 0;

    if (splitMethod === 'equal') {
        const perPerson = checkedCount > 0 ? (totalAmount / checkedCount) : 0;
        checkboxes.forEach(cb => {
            const mId = cb.getAttribute('data-id');
            const elem = document.getElementById(`calc-expense-share-${mId}`);
            if (cb.checked) {
                computedShares[mId] = perPerson;
                sharesSum += perPerson;
                if (elem) elem.textContent = `₹${perPerson.toFixed(2)}`;
            } else {
                computedShares[mId] = 0;
                if (elem) elem.textContent = '₹0.00';
            }
        });
    } else if (splitMethod === 'percentage') {
        checkboxes.forEach(cb => {
            const mId = cb.getAttribute('data-id');
            const inp = document.querySelector(`.expense-percentage-input[data-id="${mId}"]`);
            const elem = document.getElementById(`calc-expense-share-${mId}`);
            if (cb.checked && inp) {
                const pct = parseFloat(inp.value) || 0;
                const amt = (totalAmount * pct) / 100;
                computedShares[mId] = amt;
                sharesSum += amt;
                if (elem) elem.textContent = `₹${amt.toFixed(2)}`;
            } else {
                computedShares[mId] = 0;
                if (elem) elem.textContent = '₹0.00';
            }
        });
    } else {
        // Custom amounts
        checkboxes.forEach(cb => {
            const mId = cb.getAttribute('data-id');
            const inp = document.querySelector(`.expense-custom-input[data-id="${mId}"]`);
            if (cb.checked && inp) {
                const amt = parseFloat(inp.value) || 0;
                computedShares[mId] = amt;
                sharesSum += amt;
            } else {
                computedShares[mId] = 0;
            }
        });
    }

    const sumElem = document.getElementById('expenseTotalSharesSum');
    const msgBox = document.getElementById('expenseSplitValidationMsg');

    if (sumElem) {
        sumElem.textContent = `₹${sharesSum.toFixed(2)} / ₹${totalAmount.toFixed(2)}`;
    }

    const diff = Math.abs(sharesSum - totalAmount);
    if (totalAmount > 0 && diff > 0.05) {
        if (msgBox) {
            msgBox.textContent = `Shares sum (₹${sharesSum.toFixed(2)}) must equal total expense amount (₹${totalAmount.toFixed(2)}). Difference: ₹${(totalAmount - sharesSum).toFixed(2)}`;
            msgBox.className = 'split-validation-msg';
        }
    } else {
        if (msgBox) {
            msgBox.textContent = 'Shares matched successfully.';
            msgBox.className = 'split-validation-msg success';
        }
    }

    return { shares: computedShares, isValid: totalAmount > 0 && diff <= 0.05 && checkedCount > 0 };
}

// -------------------------------------------------------------
// AI Classification & Explanation
// -------------------------------------------------------------
async function classifyExpenseDescription(text) {
    if (!text || text.trim() === '') return;

    try {
        const res = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: text.trim() })
        });
        if (!res.ok) return;

        const data = await res.json();
        displayAIPrediction(data);
    } catch (err) {
        console.error('Prediction API Error:', err);
    }
}

function displayAIPrediction(data) {
    const box = document.getElementById('aiPredictionBox');
    const catName = document.getElementById('aiPredictedCategory');
    const badge = document.getElementById('aiConfidenceBadge');
    const confText = document.getElementById('aiConfidenceText');
    const quality = document.getElementById('confidenceQuality');
    const fill = document.getElementById('confidenceProgressFill');
    const catSelect = document.getElementById('expenseCategory');
    const confInput = document.getElementById('confidenceValue');

    if (!box) return;

    const percent = Math.round(data.confidence * 100);
    if (catName) catName.textContent = data.category;
    if (badge) badge.textContent = `${percent}%`;
    if (confText) confText.textContent = `${percent}%`;
    if (fill) fill.style.width = `${percent}%`;
    if (confInput) confInput.value = data.confidence;

    if (quality) {
        if (percent >= 80) {
            quality.textContent = 'High Confidence';
            quality.style.color = '#10b981';
            fill.style.backgroundColor = '#10b981';
        } else if (percent >= 60) {
            quality.textContent = 'Moderate Confidence';
            quality.style.color = '#f59e0b';
            fill.style.backgroundColor = '#f59e0b';
        } else {
            quality.textContent = 'Low Confidence';
            quality.style.color = '#ef4444';
            fill.style.backgroundColor = '#ef4444';
        }
    }

    lastAIPredictedCategory = data.category;
    if (catSelect && data.category) {
        catSelect.value = data.category;
    }

    handleCategoryChangeState();
    box.classList.remove('hidden');
}

function handleCategoryChangeState() {
    const catSelect = document.getElementById('expenseCategory');
    const alertBox = document.getElementById('manualCorrectionAlert');
    const origText = document.getElementById('originalPredictionText');
    const corrText = document.getElementById('correctedCategoryText');
    const otherWrapper = document.getElementById('otherCategoryWrapper');

    const selected = catSelect?.value;

    if (selected === 'Other') {
        otherWrapper?.classList.remove('hidden');
    } else {
        otherWrapper?.classList.add('hidden');
    }

    if (lastAIPredictedCategory && selected && selected !== lastAIPredictedCategory) {
        if (origText) origText.textContent = lastAIPredictedCategory;
        if (corrText) corrText.textContent = selected;
        alertBox?.classList.remove('hidden');
    } else {
        alertBox?.classList.add('hidden');
    }
}

// AI Explain Button Handler
async function handleExplainClick() {
    const desc = document.getElementById('expenseDescription')?.value.trim();
    const category = document.getElementById('expenseCategory')?.value;

    if (!desc) {
        showToast('Please type an expense description first.', 'error');
        return;
    }

    const modal = document.getElementById('aiExplainModal');
    const descElem = document.getElementById('explainExpenseDesc');
    const catElem = document.getElementById('explainCategoryBadge');
    const textElem = document.getElementById('explainTextContent');

    if (descElem) descElem.textContent = desc;
    if (catElem) catElem.textContent = category || 'Food';
    if (textElem) textElem.textContent = 'Generating explanation...';
    modal?.classList.remove('hidden');

    try {
        const res = await fetch('/explain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: desc, category: category })
        });
        const data = await res.json();
        if (textElem) textElem.textContent = data.explanation || 'Categorized using local NLP model.';
    } catch (err) {
        if (textElem) textElem.textContent = 'Error generating explanation.';
    }
}

function setupExpenseEventListeners() {
    const descInput = document.getElementById('expenseDescription');
    if (descInput) {
        descInput.addEventListener('input', () => {
            clearTimeout(predictDebounceTimer);
            const val = descInput.value.trim();
            if (val.length >= 3) {
                predictDebounceTimer = setTimeout(() => classifyExpenseDescription(val), 350);
            }
        });
    }

    document.getElementById('btnPredictCategory')?.addEventListener('click', () => {
        const val = descInput?.value.trim();
        if (val) classifyExpenseDescription(val);
    });

    document.getElementById('btnExplainAI')?.addEventListener('click', handleExplainClick);
    document.getElementById('btnCloseExplainModal')?.addEventListener('click', () => {
        document.getElementById('aiExplainModal')?.classList.add('hidden');
    });
    document.getElementById('btnDismissExplain')?.addEventListener('click', () => {
        document.getElementById('aiExplainModal')?.classList.add('hidden');
    });

    document.getElementById('expenseCategory')?.addEventListener('change', handleCategoryChangeState);
    document.getElementById('expenseAmount')?.addEventListener('input', recalculateExpenseShares);

    document.querySelectorAll('input[name="expenseSplitMethod"]').forEach(r => {
        r.addEventListener('change', renderExpenseSharesTable);
    });

    document.getElementById('selectAllExpenseParticipants')?.addEventListener('change', (e) => {
        document.querySelectorAll('.expense-member-checkbox').forEach(cb => cb.checked = e.target.checked);
        recalculateExpenseShares();
    });

    // Sample Chips
    document.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const desc = btn.getAttribute('data-desc');
            const amt = btn.getAttribute('data-amount');
            if (descInput) descInput.value = desc;
            const amtInput = document.getElementById('expenseAmount');
            if (amtInput && amt) amtInput.value = amt;
            classifyExpenseDescription(desc);
            recalculateExpenseShares();
        });
    });

    // Form Submit
    const form = document.getElementById('addExpenseForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupId = getActiveGroupId();
            const desc = document.getElementById('expenseDescription').value.trim();
            const amount = parseFloat(document.getElementById('expenseAmount').value);
            const paidBy = parseInt(document.getElementById('expensePaidBy').value);
            let category = document.getElementById('expenseCategory').value;
            const confidence = parseFloat(document.getElementById('confidenceValue').value) || 1.0;
            const date = document.getElementById('expenseDate').value;
            const splitMethod = document.querySelector('input[name="expenseSplitMethod"]:checked')?.value || 'equal';

            if (!desc) {
                showToast('Please enter an expense description.', 'error');
                return;
            }
            if (!paidBy) {
                showToast('Please select who personally paid for this expense.', 'error');
                return;
            }
            if (!category) {
                showToast('Please select a category.', 'error');
                return;
            }

            if (category === 'Other') {
                const custom = document.getElementById('customOtherName')?.value.trim();
                if (custom) category = `Other (${custom})`;
            }

            const calc = recalculateExpenseShares();
            if (!calc.isValid) {
                showToast('The sum of member shares must equal the total expense amount.', 'error');
                return;
            }

            const activeShares = {};
            for (const [mId, sAmt] of Object.entries(calc.shares)) {
                if (sAmt > 0) activeShares[mId] = sAmt;
            }

            const submitBtn = document.getElementById('btnSubmitExpense');
            try {
                if (submitBtn) submitBtn.disabled = true;

                const res = await fetch('/api/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group_id: groupId,
                        description: desc,
                        amount: amount,
                        paid_by: paidBy,
                        category: category,
                        confidence: confidence,
                        date: date,
                        split_method: splitMethod,
                        shares: activeShares
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to record expense');

                showToast('Expense recorded successfully!');
                document.getElementById('expenseDescription').value = '';
                document.getElementById('expenseAmount').value = '';
                document.getElementById('aiPredictionBox')?.classList.add('hidden');
                document.getElementById('manualCorrectionAlert')?.classList.add('hidden');
                recalculateExpenseShares();
                loadExistingExpenses(groupId);
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
}

async function loadExistingExpenses(groupId) {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`/api/expenses?group_id=${groupId}`);
        const data = await res.json();
        const expenses = data.expenses || [];

        if (expenses.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No expenses recorded for this group yet.</td></tr>';
            return;
        }

        tbody.innerHTML = expenses.map(exp => {
            const sharesList = (exp.shares || []).map(s => `${escapeHtml(s.member_name)}: ₹${parseFloat(s.share_amount).toFixed(2)}`).join(', ');
            const baseBadgeClass = exp.category.startsWith('Other') ? 'Other' : exp.category;

            return `
                <tr>
                    <td class="text-muted">${escapeHtml(exp.date)}</td>
                    <td><strong>${escapeHtml(exp.description)}</strong></td>
                    <td><span class="badge badge-${escapeHtml(baseBadgeClass)}">${escapeHtml(exp.category)}</span></td>
                    <td>${escapeHtml(exp.payer_name)}</td>
                    <td><strong>₹${parseFloat(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                    <td style="font-size: 0.8125rem;">${sharesList}</td>
                    <td class="text-right">
                        <button class="btn btn-danger-outline btn-sm" onclick="deleteExpenseRecord(${exp.id})">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading expenses:', err);
    }
}

async function deleteExpenseRecord(expenseId) {
    if (!confirm('Are you sure you want to delete this expense? Balances will be recalculated.')) return;

    try {
        const res = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete expense');

        showToast('Expense deleted. Balances updated.');
        loadExpensesPage();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
