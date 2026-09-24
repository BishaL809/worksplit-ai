// =========================================================
// WorkSplit AI - Groups & Members Management
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    loadGroupsView();
    setupGroupEventListeners();
});

async function loadGroupsView() {
    const activeGroupId = getActiveGroupId();

    try {
        const res = await fetch('/api/groups');
        const data = await res.json();
        renderGroupsList(data.groups, activeGroupId);

        if (activeGroupId) {
            loadMembersView(activeGroupId);
        }
    } catch (err) {
        console.error('Error loading groups:', err);
    }
}

function renderGroupsList(groups, activeId) {
    const list = document.getElementById('groupsList');
    if (!list) return;

    if (!groups || groups.length === 0) {
        list.innerHTML = '<div class="text-center text-muted">No groups created yet. Create one above!</div>';
        return;
    }

    list.innerHTML = groups.map(g => {
        const isActive = String(g.id) === String(activeId);
        return `
            <div class="group-item-card ${isActive ? 'active' : ''}">
                <div>
                    <strong>${escapeHtml(g.name)}</strong>
                    <div class="text-muted" style="font-size: 0.75rem;">${g.member_count} members</div>
                </div>
                <div style="display: flex; gap: 0.35rem;">
                    ${isActive ? '<span class="status-badge status-receive">Active</span>' : `<button class="btn btn-outline btn-sm" onclick="setActiveGroup(${g.id})">Switch</button>`}
                    <button class="btn btn-secondary btn-sm" onclick="renameGroup(${g.id}, '${escapeHtml(g.name)}')">Rename</button>
                    <button class="btn btn-danger-outline btn-sm" onclick="deleteGroup(${g.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadMembersView(groupId) {
    const title = document.getElementById('activeGroupTitleName');
    const list = document.getElementById('membersList');

    try {
        const gRes = await fetch(`/api/groups/${groupId}`);
        if (gRes.ok) {
            const gData = await gRes.json();
            if (title && gData.group) title.textContent = gData.group.name;
        }

        const res = await fetch(`/api/groups/${groupId}/members`);
        const data = await res.json();

        if (!list) return;
        if (!data.members || data.members.length === 0) {
            list.innerHTML = '<div class="text-center text-muted">No members yet. Add members above!</div>';
            return;
        }

        list.innerHTML = data.members.map(m => `
            <div class="member-item-card">
                <div>
                    <strong>${escapeHtml(m.name)}</strong>
                </div>
                <div style="display: flex; gap: 0.35rem;">
                    <button class="btn btn-secondary btn-sm" onclick="openRenameMemberModal(${m.id}, '${escapeHtml(m.name)}')">Rename</button>
                    <button class="btn btn-danger-outline btn-sm" onclick="deleteMember(${m.id})">Remove</button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('Error loading members:', err);
    }
}

function setupGroupEventListeners() {
    // 1. Create Group
    const createForm = document.getElementById('createGroupForm');
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('newGroupName');
            const name = input.value.trim();
            if (!name) return;

            try {
                const res = await fetch('/api/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to create group');

                showToast('Group created successfully!');
                input.value = '';
                localStorage.setItem('worksplit_active_group', data.group_id);
                loadActiveGroups();
                loadGroupsView();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    // 2. Add Member
    const addMemberForm = document.getElementById('addMemberForm');
    if (addMemberForm) {
        addMemberForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const groupId = getActiveGroupId();
            const input = document.getElementById('newMemberName');
            const name = input.value.trim();
            if (!name) return;

            try {
                const res = await fetch(`/api/groups/${groupId}/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to add member');

                showToast(`Added ${name} to group!`);
                input.value = '';
                loadGroupsView();
                loadActiveGroups();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }

    // Modal Renaming listeners
    const modal = document.getElementById('editMemberModal');
    const btnClose = document.getElementById('btnCloseMemberModal');
    const btnCancel = document.getElementById('btnCancelMemberEdit');
    const form = document.getElementById('editMemberForm');

    [btnClose, btnCancel].forEach(b => {
        if (b) b.addEventListener('click', () => modal?.classList.add('hidden'));
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('editMemberId').value;
            const name = document.getElementById('editMemberNameInput').value.trim();
            if (!name) return;

            try {
                const res = await fetch(`/api/members/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                if (!res.ok) throw new Error('Failed to update member name');

                showToast('Member renamed successfully.');
                modal?.classList.add('hidden');
                loadGroupsView();
            } catch (err) {
                showToast(err.message, 'error');
            }
        });
    }
}

function setActiveGroup(groupId) {
    localStorage.setItem('worksplit_active_group', groupId);
    const select = document.getElementById('activeGroupSelect');
    if (select) select.value = groupId;
    showToast('Active group changed.');
    loadGroupsView();
}

async function renameGroup(groupId, oldName) {
    const newName = prompt('Enter new group name:', oldName);
    if (!newName || newName.trim() === '' || newName === oldName) return;

    try {
        const res = await fetch(`/api/groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
        });
        if (!res.ok) throw new Error('Failed to rename group');

        showToast('Group renamed.');
        loadGroupsView();
        loadActiveGroups();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteGroup(groupId) {
    if (!confirm('Are you sure you want to delete this group and all its transactions?')) return;

    try {
        const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete group');

        showToast('Group deleted.');
        localStorage.removeItem('worksplit_active_group');
        loadActiveGroups();
        loadGroupsView();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function openRenameMemberModal(memberId, currentName) {
    document.getElementById('editMemberId').value = memberId;
    document.getElementById('editMemberNameInput').value = currentName;
    document.getElementById('editMemberModal')?.classList.remove('hidden');
}

async function deleteMember(memberId) {
    if (!confirm('Remove this member and their shares from the group?')) return;

    try {
        const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to remove member');

        showToast('Member removed.');
        loadGroupsView();
        loadActiveGroups();
    } catch (err) {
        showToast(err.message, 'error');
    }
}
