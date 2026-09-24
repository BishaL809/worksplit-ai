// =========================================================
// WorkSplit AI - Settlement Engine & Who-Pays-Whom Plan
// =========================================================

let currentGroupMembers = [];

document.addEventListener('DOMContentLoaded', () => {
    loadSettlementView();
    setupSettlementEventListeners();
    window.addEventListener('activeGroupChanged', loadSettlementView);
});

async function loadSettlementView() {
    const groupId = getActiveGroupId();
    if (!groupId) return;

    try {
        const memRes = await fetch(`/api/groups/${groupId}/members`);
        const memData = await memRes.json();
        currentGroupMembers = memData.members || [];
        populateSettlementModalDropdowns(currentGroupMembers);

        const res = await fetch(`/api/settlement?group_id=${groupId}`);
        const data = await res.json();
        renderSettlementCards(data.settlement_plan || []);

        loadRecordedSettlements(groupId);
    } catch (err) {
        console.error('Error loading settlement plan:', err);
    }
}

function renderSettlementCards(plan) {
    const grid = document.getElementById('settlementFlowGrid');
    const badge = document.getElementById('settlementCountBadge');
    if (!grid) return;

    if (badge) badge.textContent = `${plan.length} Payment${plan.length === 1 ? '' : 's'} Needed`;

    if (plan.length === 0) {
        grid.innerHTML = `
            <div class="empty-card" style="grid-column: 1/-1; text-align: center; padding: 2rem;">
                <h4 style="color: #10b981; margin-bottom: 0.5rem;">🎉 Everyone is All Settled Up!</h4>
                <p class="text-muted">Nobody owes anyone anything right now. All balances are clear!</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = plan.map(item => `
        <div class="settlement-card">
            <div class="settlement-flow-header">
                <div class="flow-entity">
                    <span class="flow-label">Who Pays</span>
                    <span class="flow-name" style="color: #b91c1c; font-weight: 700;">${escapeHtml(item.from_name)}</span>
                </div>
                <div class="flow-direction-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </div>
                <div class="flow-entity" style="text-align: right;">
                    <span class="flow-label">Gets Paid</span>
                    <span class="flow-name" style="color: #15803d; font-weight: 700;">${escapeHtml(item.to_name)}</span>
                </div>
            </div>

            <div class="settlement-card-amount">
                ₹${parseFloat(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>

            <button type="button" class="btn btn-primary btn-sm" onclick="openSettleNowModal(${item.from_member_id}, ${item.to_member_id}, ${item.amount})" style="width: 100%; justify-content: center;">
                Mark as Paid ✅
            </button>
        </div>
    `).join('');
}

function populateSettlementModalDropdowns(members) {
    const fromSelect = document.getElementById('settlementFromMember');
    const toSelect = document.getElementById('settlementToMember');
    if (!fromSelect || !toSelect) return;

    const opts = members.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
    fromSelect.innerHTML = opts;
    toSelect.innerHTML = opts;
}

function openSettleNowModal(fromId, toId, amount) {
    const modal = document.getElementById('recordSettlementModal');
    const fromSelect = document.getElementById('settlementFromMember');
    const toSelect = document.getElementById('settlementToMember');
    const amountInp = document.getElementById('settlementAmount');

    if (fromSelect) fromSelect.value = fromId;
    if (toSelect) toSelect.value = toId;
    if (amountInp) amountInp.value = amount;

    modal?.classList.remove('hidden');
}

function setupSettlementEventListeners() {
    const modal = document.getElementById('recordSettlementModal');
    const btnOpen = document.getElementById('btnOpenCustomSettlement');
    const btnClose = document.getElementById('btnCloseSettlementModal');
    const btnCancel = document.getElementById('btnCancelSettlement');
    const backdrop = document.getElementById('modalSettlementBackdrop');
    const form = document.getElementById('recordSettlementForm');

    if (btnOpen) btnOpen.addEventListener('click', () => modal?.classList.remove('hidden'));

    [btnClose, btnCancel, backdrop].forEach(el => {
        el?.addEventListener('click', () => modal?.classList.add('hidden'));
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupId = getActiveGroupId();
            const fromMember = parseInt(document.getElementById('settlementFromMember').value);
            const toMember = parseInt(document.getElementById('settlementToMember').value);
            const amount = parseFloat(document.getElementById('settlementAmount').value);
            const date = document.getElementById('settlementDate').value;
            const notes = document.getElementById('settlementNotes').value.trim();

            if (fromMember === toMember) {
                showToast('Payer and receiver cannot be the same member.', 'error');
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                showToast('Please enter a valid transfer amount.', 'error');
                return;
            }

            try {
                const res = await fetch('/api/settlements', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        group_id: groupId,
                        from_member: fromMember,
                        to_member: toMember,
                        amount: amount,
                        date: date,
                        notes: notes
                    })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to record settlement');

                showToast('Settlement transfer recorded!');
                modal?.classList.add('hidden');
                loadSettlementView();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }
}

async function loadRecordedSettlements(groupId) {
    const tbody = document.getElementById('settlementsHistoryBody');
    if (!tbody) return;

    try {
        const res = await fetch(`/api/settlements?group_id=${groupId}`);
        const data = await res.json();
        const settlements = data.settlements || [];

        if (settlements.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No settlements recorded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = settlements.map(s => `
            <tr>
                <td class="text-muted">${escapeHtml(s.date)}</td>
                <td><strong style="color: #b91c1c;">${escapeHtml(s.from_member_name)}</strong></td>
                <td><strong style="color: #15803d;">${escapeHtml(s.to_member_name)}</strong></td>
                <td><strong>₹${parseFloat(s.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                <td>${escapeHtml(s.notes || 'Settlement Transfer')}</td>
                <td class="text-right">
                    <button class="btn btn-danger-outline btn-sm" onclick="deleteSettlementRecord(${s.id})">Delete</button>
                </td>
            </tr>
        `).join('');

    } catch (err) {
        console.error('Error loading settlements:', err);
    }
}

async function deleteSettlementRecord(settlementId) {
    if (!confirm('Undo this settlement transfer? Balances will be recalculated.')) return;

    try {
        const res = await fetch(`/api/settlements/${settlementId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete settlement');

        showToast('Settlement record removed.');
        loadSettlementView();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
