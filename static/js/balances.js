// =========================================================
// WorkSplit AI - Individual Member Balances JavaScript
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    loadDetailedBalances();
    window.addEventListener('activeGroupChanged', loadDetailedBalances);
});

async function loadDetailedBalances() {
    const groupId = getActiveGroupId();
    const tbody = document.getElementById('detailedBalancesBody');
    if (!tbody || !groupId) return;

    try {
        const res = await fetch(`/api/balances?group_id=${groupId}`);
        const data = await res.json();
        const members = data.members || [];

        if (members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No members found in this group.</td></tr>';
            return;
        }

        tbody.innerHTML = members.map(m => {
            const net = m.net_balance;
            let netColor = 'zero';
            let statusText = 'All Settled (₹0)';
            let sign = '';

            if (net > 0.009) {
                netColor = 'positive';
                badgeClass = 'status-receive';
                statusText = `Gets back ₹${net.toFixed(2)}`;
                sign = '+';
            } else if (net < -0.009) {
                netColor = 'negative';
                badgeClass = 'status-pay';
                statusText = `Needs to pay ₹${Math.abs(net).toFixed(2)}`;
                sign = '-';
            }

            const settlementNet = m.settlements_paid - m.settlements_received;
            const settlementStr = settlementNet !== 0 ? (settlementNet > 0 ? `+₹${settlementNet.toFixed(2)}` : `-₹${Math.abs(settlementNet).toFixed(2)}`) : '₹0.00';

            return `
                <tr>
                    <td><strong>${escapeHtml(m.name)}</strong></td>
                    <td class="text-success">₹${m.total_earned.toFixed(2)}</td>
                    <td>₹${m.physically_received.toFixed(2)}</td>
                    <td class="text-primary">₹${m.personally_paid.toFixed(2)}</td>
                    <td class="text-danger">₹${m.expense_share.toFixed(2)}</td>
                    <td class="text-muted">${settlementStr}</td>
                    <td><strong class="member-card-balance ${netColor}" style="font-size: 1.05rem;">${sign}₹${net.toFixed(2)}</strong></td>
                    <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading balances:', err);
    }
}
