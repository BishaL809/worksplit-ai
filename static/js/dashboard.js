// =========================================================
// WorkSplit AI - Dashboard JavaScript
// =========================================================

let pieChartInstance = null;
let barChartInstance = null;

const CATEGORY_COLORS = {
    'Food': '#f97316',
    'Transportation': '#0284c7',
    'Work': '#4f46e5',
    'Shopping': '#8b5cf6',
    'Bills': '#ef4444',
    'Entertainment': '#ec4899',
    'Healthcare': '#10b981',
    'Education': '#14b8a6',
    'Other': '#64748b'
};

document.addEventListener('DOMContentLoaded', () => {
    loadDashboardData();
    window.addEventListener('activeGroupChanged', () => {
        loadDashboardData();
    });
});

async function loadDashboardData() {
    const groupId = getActiveGroupId();
    if (!groupId) return;

    try {
        const res = await fetch(`/api/dashboard?group_id=${groupId}`);
        if (!res.ok) throw new Error('Failed to load dashboard data');

        const data = await res.json();
        updateKPICards(data.summary);
        renderMemberBalancesGrid(data.members);
        renderCharts(data.categories, data.members);
        renderRecentTransactions(data.recent_transactions);
        renderCategorySummaryTable(data.categories);
    } catch (err) {
        console.error('Dashboard Error:', err);
    }
}

function updateKPICards(summary) {
    if (!summary) return;
    document.getElementById('kpi-total-income').textContent = `₹${summary.total_income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-total-expenses').textContent = `₹${summary.total_expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-remaining-balance').textContent = `₹${summary.remaining_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-member-count').textContent = summary.member_count || 0;
}

function renderMemberBalancesGrid(members) {
    const grid = document.getElementById('memberBalancesGrid');
    if (!grid) return;

    if (!members || members.length === 0) {
        grid.innerHTML = '<div class="text-center text-muted" style="grid-column: 1/-1; padding: 1.5rem;">No members in this group.</div>';
        return;
    }

    grid.innerHTML = members.map(m => {
        const net = m.net_balance;
        let colorClass = 'zero';
        let badgeClass = 'status-settled';
        let statusLabel = 'All Settled (₹0)';
        let sign = '';

        if (net > 0.009) {
            colorClass = 'positive';
            badgeClass = 'status-receive';
            sign = '+';
            statusLabel = 'Gets back money';
        } else if (net < -0.009) {
            colorClass = 'negative';
            badgeClass = 'status-pay';
            sign = '-';
            statusLabel = 'Needs to pay';
        }

        return `
            <div class="member-balance-card">
                <div class="member-card-name">${escapeHtml(m.name)}</div>
                <div class="member-card-balance ${colorClass}">${sign}₹${Math.abs(net).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                <div>
                    <span class="status-badge ${badgeClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderCharts(categories, members) {
    // 1. Doughnut Chart: Expenses by Category
    const pieCtx = document.getElementById('categoryPieChart');
    if (pieCtx && typeof Chart !== 'undefined') {
        if (pieChartInstance) pieChartInstance.destroy();

        const labels = categories && categories.length > 0 ? categories.map(c => c.category) : ['No Expenses'];
        const amounts = categories && categories.length > 0 ? categories.map(c => c.total) : [1];
        const colors = categories && categories.length > 0 ? labels.map(l => CATEGORY_COLORS[l] || '#64748b') : ['#e2e8f0'];

        pieChartInstance = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: amounts,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { boxWidth: 12 } },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (!categories || categories.length === 0) return ' No expenses';
                                return ` ${ctx.label}: ₹${ctx.raw.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }

    // 2. Bar Chart: Member Net Balances
    const barCtx = document.getElementById('balanceBarChart');
    if (barCtx && typeof Chart !== 'undefined') {
        if (barChartInstance) barChartInstance.destroy();

        const memberNames = members ? members.map(m => m.name) : [];
        const balances = members ? members.map(m => m.net_balance) : [];
        const barColors = balances.map(b => b >= 0 ? '#10b981' : '#ef4444');

        barChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: memberNames,
                datasets: [{
                    label: 'Net Balance (₹)',
                    data: balances,
                    backgroundColor: barColors,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.raw;
                                const sign = val > 0 ? '+' : '';
                                return ` Net Balance: ${sign}₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            callback: function(val) {
                                return '₹' + val;
                            }
                        }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    }
}

function renderRecentTransactions(txns) {
    const tbody = document.getElementById('recentTransactionsBody');
    if (!tbody) return;

    if (!txns || txns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No recent transactions recorded.</td></tr>';
        return;
    }

    tbody.innerHTML = txns.map(t => {
        let typeBadgeClass = 'type-badge-expense';
        if (t.type === 'WORK PAYMENT') typeBadgeClass = 'type-badge-payment';
        else if (t.type === 'SETTLEMENT') typeBadgeClass = 'type-badge-settlement';

        return `
            <tr>
                <td class="text-muted">${escapeHtml(t.date)}</td>
                <td><span class="type-badge ${typeBadgeClass}">${t.type}</span></td>
                <td><strong>${escapeHtml(t.description)}</strong></td>
                <td>${escapeHtml(t.primary_person)}</td>
                <td><strong>₹${parseFloat(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
            </tr>
        `;
    }).join('');
}

function renderCategorySummaryTable(categories) {
    const tbody = document.getElementById('categorySummaryBody');
    if (!tbody) return;

    if (!categories || categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No expenses recorded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = categories.map(cat => `
        <tr>
            <td>
                <span class="badge badge-${escapeHtml(cat.category)}">${escapeHtml(cat.category)}</span>
            </td>
            <td><strong>₹${cat.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
            <td><span class="text-muted">${cat.percentage}%</span></td>
        </tr>
    `).join('');
}
