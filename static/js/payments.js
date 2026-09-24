// =========================================================
// WorkSplit AI - Work Payments & Earnings JavaScript
// =========================================================

let currentGroupMembers = [];

document.addEventListener('DOMContentLoaded', () => {
    loadPaymentsPage();
    setupPaymentEventListeners();
    window.addEventListener('activeGroupChanged', loadPaymentsPage);
});

async function loadPaymentsPage() {
    const groupId = getActiveGroupId();
    if (!groupId) return;

    try {
        const memRes = await fetch(`/api/groups/${groupId}/members`);
        const memData = await memRes.json();
        currentGroupMembers = memData.members || [];

        populateReceiversDropdown(currentGroupMembers);
        renderPaymentSharesTable();
        loadExistingPayments(groupId);
    } catch (err) {
        console.error('Error loading payments page:', err);
    }
}

function populateReceiversDropdown(members) {
    const select = document.getElementById('paymentReceivedBy');
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Select receiver...</option>';
    members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        select.appendChild(opt);
    });
}

function renderPaymentSharesTable() {
    const tbody = document.getElementById('paymentSharesBody');
    if (!tbody) return;

    if (currentGroupMembers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No members in this group. Please add members first!</td></tr>';
        return;
    }

    const splitMethod = document.querySelector('input[name="paymentSplitMethod"]:checked')?.value || 'equal';
    const header = document.getElementById('paymentShareColHeader');
    if (header) {
        if (splitMethod === 'percentage') header.textContent = 'Share (%) & Amount';
        else header.textContent = 'Share Amount (₹)';
    }

    tbody.innerHTML = currentGroupMembers.map(m => `
        <tr data-member-id="${m.id}">
            <td>
                <input type="checkbox" class="payment-member-checkbox" data-id="${m.id}" checked>
            </td>
            <td><strong>${escapeHtml(m.name)}</strong></td>
            <td class="share-input-cell">
                ${renderShareInput(m.id, splitMethod)}
            </td>
        </tr>
    `).join('');

    attachShareInputListeners();
    recalculatePaymentShares();
}

function renderShareInput(memberId, method) {
    if (method === 'equal') {
        return `<span class="calculated-share-val" id="calc-payment-share-${memberId}">₹0.00</span>`;
    } else if (method === 'percentage') {
        return `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input type="number" class="form-control form-control-sm payment-percentage-input" data-id="${memberId}" style="width: 80px;" min="0" max="100" step="0.1" value="0">
                <span class="calculated-share-val" id="calc-payment-share-${memberId}">₹0.00</span>
            </div>
        `;
    } else {
        return `
            <div class="input-currency-wrapper">
                <span class="currency-symbol" style="left: 0.5rem; font-size: 0.8rem;">₹</span>
                <input type="number" class="form-control form-control-sm payment-custom-input with-prefix" data-id="${memberId}" style="width: 120px;" min="0" step="0.01" value="0.00">
            </div>
        `;
    }
}

function attachShareInputListeners() {
    const checkboxes = document.querySelectorAll('.payment-member-checkbox');
    checkboxes.forEach(cb => cb.addEventListener('change', recalculatePaymentShares));

    const pInputs = document.querySelectorAll('.payment-percentage-input, .payment-custom-input');
    pInputs.forEach(inp => inp.addEventListener('input', recalculatePaymentShares));
}

function recalculatePaymentShares() {
    const totalAmount = parseFloat(document.getElementById('paymentAmount')?.value) || 0;
    const splitMethod = document.querySelector('input[name="paymentSplitMethod"]:checked')?.value || 'equal';
    const checkboxes = Array.from(document.querySelectorAll('.payment-member-checkbox'));
    const checkedMembers = checkboxes.filter(cb => cb.checked);
    const checkedCount = checkedMembers.length;

    let computedShares = {};
    let sharesSum = 0;

    if (splitMethod === 'equal') {
        const perPerson = checkedCount > 0 ? (totalAmount / checkedCount) : 0;
        checkboxes.forEach(cb => {
            const mId = cb.getAttribute('data-id');
            const elem = document.getElementById(`calc-payment-share-${mId}`);
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
        let totalPercent = 0;
        checkboxes.forEach(cb => {
            const mId = cb.getAttribute('data-id');
            const inp = document.querySelector(`.payment-percentage-input[data-id="${mId}"]`);
            const elem = document.getElementById(`calc-payment-share-${mId}`);
            if (cb.checked && inp) {
                const pct = parseFloat(inp.value) || 0;
                totalPercent += pct;
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
            const inp = document.querySelector(`.payment-custom-input[data-id="${mId}"]`);
            if (cb.checked && inp) {
                const amt = parseFloat(inp.value) || 0;
                computedShares[mId] = amt;
                sharesSum += amt;
            } else {
                computedShares[mId] = 0;
            }
        });
    }

    // Update validation feedback
    const sumElem = document.getElementById('paymentTotalSharesSum');
    const msgBox = document.getElementById('paymentSplitValidationMsg');

    if (sumElem) {
        sumElem.textContent = `₹${sharesSum.toFixed(2)} / ₹${totalAmount.toFixed(2)}`;
    }

    const diff = Math.abs(sharesSum - totalAmount);
    if (totalAmount > 0 && diff > 0.05) {
        if (msgBox) {
            msgBox.textContent = `Shares sum (₹${sharesSum.toFixed(2)}) must equal total payment amount (₹${totalAmount.toFixed(2)}). Difference: ₹${(totalAmount - sharesSum).toFixed(2)}`;
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

function setupPaymentEventListeners() {
    const amountInput = document.getElementById('paymentAmount');
    if (amountInput) amountInput.addEventListener('input', recalculatePaymentShares);

    const radios = document.querySelectorAll('input[name="paymentSplitMethod"]');
    radios.forEach(r => r.addEventListener('change', renderPaymentSharesTable));

    const selectAll = document.getElementById('selectAllPaymentParticipants');
    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            document.querySelectorAll('.payment-member-checkbox').forEach(cb => cb.checked = e.target.checked);
            recalculatePaymentShares();
        });
    }

    const form = document.getElementById('addPaymentForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupId = getActiveGroupId();
            const amount = parseFloat(document.getElementById('paymentAmount').value);
            const receivedBy = parseInt(document.getElementById('paymentReceivedBy').value);
            const date = document.getElementById('paymentDate').value;
            const splitMethod = document.querySelector('input[name="paymentSplitMethod"]:checked')?.value || 'equal';
            const notes = document.getElementById('paymentNotes').value.trim();

            if (!receivedBy) {
                showToast('Please select who physically received the payment.', 'error');
                return;
            }

            const calc = recalculatePaymentShares();
            if (!calc.isValid) {
                showToast('The sum of member shares must equal the total payment amount.', 'error');
                return;
            }

            // Filter out non-participants or 0 shares
            const activeShares = {};
            for (const [mId, sAmt] of Object.entries(calc.shares)) {
                if (sAmt > 0) activeShares[mId] = sAmt;
            }

            const submitBtn = document.getElementById('btnSubmitPayment');
            try {
                if (submitBtn) submitBtn.disabled = true;

                const res = await fetch('/api/payments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group_id: groupId,
                        amount: amount,
                        received_by: receivedBy,
                        date: date,
                        split_method: splitMethod,
                        notes: notes,
                        shares: activeShares
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to record payment');

                showToast('Work payment recorded successfully!');
                document.getElementById('paymentAmount').value = '';
                document.getElementById('paymentNotes').value = '';
                recalculatePaymentShares();
                loadExistingPayments(groupId);
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
}

async function loadExistingPayments(groupId) {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`/api/payments?group_id=${groupId}`);
        const data = await res.json();
        const payments = data.payments || [];

        if (payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No payments recorded for this group yet.</td></tr>';
            return;
        }

        tbody.innerHTML = payments.map(p => {
            const sharesList = (p.shares || []).map(s => `${escapeHtml(s.member_name)}: ₹${parseFloat(s.share_amount).toFixed(2)}`).join(', ');
            return `
                <tr>
                    <td class="text-muted">${escapeHtml(p.date)}</td>
                    <td><strong>${escapeHtml(p.notes || 'Work Payment')}</strong></td>
                    <td>${escapeHtml(p.receiver_name)}</td>
                    <td><strong>₹${parseFloat(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                    <td style="font-size: 0.8125rem;">${sharesList}</td>
                    <td class="text-right">
                        <button class="btn btn-danger-outline btn-sm" onclick="deleteWorkPayment(${p.id})">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading payments:', err);
    }
}

async function deleteWorkPayment(paymentId) {
    if (!confirm('Are you sure you want to delete this payment record? Balances will be recalculated.')) return;

    try {
        const res = await fetch(`/api/payments/${paymentId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete payment');

        showToast('Payment deleted. Balances updated.');
        loadPaymentsPage();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
