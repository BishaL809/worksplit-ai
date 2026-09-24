// =========================================================
// Add Expense JavaScript - Real-time NLP Prediction & Submission
// =========================================================

let predictDebounceTimer = null;
let lastPredictedCategory = null;

document.addEventListener('DOMContentLoaded', () => {
    const descInput = document.getElementById('description');
    const btnPredict = document.getElementById('btnTriggerPredict');
    const form = document.getElementById('addExpenseForm');
    const sampleChips = document.querySelectorAll('.chip-btn');
    const categorySelect = document.getElementById('category');

    // Category change listener for manual correction detection and custom Other input
    if (categorySelect) {
        categorySelect.addEventListener('change', handleCategorySelectionChange);
    }

    // Debounced automatic classification while typing
    if (descInput) {
        descInput.addEventListener('input', () => {
            clearTimeout(predictDebounceTimer);
            const text = descInput.value.trim();
            if (text.length >= 3) {
                predictDebounceTimer = setTimeout(() => {
                    classifyExpense(text);
                }, 400);
            } else {
                hidePredictionBox();
            }
        });
    }

    // Manual classify button
    if (btnPredict) {
        btnPredict.addEventListener('click', () => {
            const text = descInput.value.trim();
            if (text) {
                classifyExpense(text);
            } else {
                showToast('Please type an expense description first.', 'error');
            }
        });
    }

    // Quick sample prompt chips
    sampleChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const desc = chip.getAttribute('data-desc');
            const amt = chip.getAttribute('data-amount');
            if (descInput) descInput.value = desc;
            const amtInput = document.getElementById('amount');
            if (amtInput && amt) amtInput.value = amt;
            classifyExpense(desc);
        });
    });

    // Handle Form Submit
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
});

async function classifyExpense(description) {
    if (!description || description.trim() === '') return;

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ description: description.trim() })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to classify');
        }

        const data = await response.json();
        displayPrediction(data);
    } catch (err) {
        console.error('Prediction API Error:', err);
    }
}

function displayPrediction(data) {
    const box = document.getElementById('aiPredictionBox');
    const catName = document.getElementById('aiPredictedCategory');
    const badge = document.getElementById('aiConfidenceBadge');
    const confText = document.getElementById('aiConfidenceText');
    const quality = document.getElementById('confidenceQuality');
    const progressFill = document.getElementById('confidenceProgressFill');
    const categorySelect = document.getElementById('category');
    const confidenceInput = document.getElementById('confidenceValue');

    if (!box) return;

    const percent = Math.round(data.confidence * 100);

    // Update UI elements
    if (catName) catName.textContent = data.category;
    if (badge) badge.textContent = `${percent}%`;
    if (confText) confText.textContent = `${percent}%`;
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (confidenceInput) confidenceInput.value = data.confidence;

    // Quality indicator
    if (quality) {
        if (percent >= 80) {
            quality.textContent = 'High Confidence';
            quality.style.color = '#10b981';
            if (progressFill) progressFill.style.backgroundColor = '#10b981';
        } else if (percent >= 60) {
            quality.textContent = 'Moderate Confidence';
            quality.style.color = '#f59e0b';
            if (progressFill) progressFill.style.backgroundColor = '#f59e0b';
        } else {
            quality.textContent = 'Low Confidence';
            quality.style.color = '#ef4444';
            if (progressFill) progressFill.style.backgroundColor = '#ef4444';
        }
    }

    // Auto-select category dropdown
    if (categorySelect && data.category) {
        categorySelect.value = data.category;
    }

    lastPredictedCategory = data.category;
    handleCategorySelectionChange();

    box.classList.remove('hidden');
}

function handleCategorySelectionChange() {
    const categorySelect = document.getElementById('category');
    const otherWrapper = document.getElementById('otherCategoryWrapper');
    const customInput = document.getElementById('customOtherName');

    if (categorySelect && otherWrapper) {
        if (categorySelect.value === 'Other') {
            otherWrapper.classList.remove('hidden');
            if (customInput) customInput.focus();
        } else {
            otherWrapper.classList.add('hidden');
        }
    }
    updateManualCorrectionAlert();
}

function updateManualCorrectionAlert() {
    const alertBox = document.getElementById('manualCorrectionAlert');
    const origText = document.getElementById('originalPredictionText');
    const corrText = document.getElementById('correctedCategoryText');
    const selected = document.getElementById('category')?.value;

    if (!alertBox) return;

    if (lastPredictedCategory && selected && selected !== lastPredictedCategory) {
        if (origText) origText.textContent = lastPredictedCategory;
        if (corrText) corrText.textContent = selected;
        alertBox.classList.remove('hidden');
    } else {
        alertBox.classList.add('hidden');
    }
}

function hidePredictionBox() {
    const box = document.getElementById('aiPredictionBox');
    if (box) box.classList.add('hidden');
    lastPredictedCategory = null;
    const otherWrapper = document.getElementById('otherCategoryWrapper');
    if (otherWrapper) otherWrapper.classList.add('hidden');
    updateManualCorrectionAlert();
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const desc = document.getElementById('description').value.trim();
    const amountVal = document.getElementById('amount').value.trim();
    let category = document.getElementById('category').value;
    const date = document.getElementById('date').value;
    const confidence = parseFloat(document.getElementById('confidenceValue').value) || 1.0;
    const submitBtn = document.getElementById('btnSubmitExpense');

    // If 'Other' is chosen, check for custom item/category name
    if (category === 'Other') {
        const customName = document.getElementById('customOtherName')?.value.trim();
        if (customName) {
            category = `Other (${customName})`;
        }
    }

    // Validation
    if (!desc) {
        showToast('Please enter an expense description.', 'error');
        return;
    }

    const amount = parseFloat(amountVal);
    if (isNaN(amount) || amount <= 0) {
        showToast('Please enter a valid positive expense amount.', 'error');
        return;
    }

    if (!category) {
        showToast('Please select a category.', 'error');
        return;
    }

    if (!date) {
        showToast('Please select a date.', 'error');
        return;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
        }

        const payload = {
            description: desc,
            amount: amount,
            category: category,
            confidence: confidence,
            date: date
        };

        const res = await fetch('/add-expense', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const result = await res.json();

        if (!res.ok) {
            throw new Error(result.error || 'Failed to save expense.');
        }

        showToast('Expense recorded successfully!', 'success');

        // Reset form fields
        document.getElementById('description').value = '';
        document.getElementById('amount').value = '';
        document.getElementById('category').selectedIndex = 0;
        const customOtherField = document.getElementById('customOtherName');
        if (customOtherField) customOtherField.value = '';
        hidePredictionBox();

        // Redirect to dashboard after a short delay so the user sees the saved result
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 800);

    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                Save Expense
            `;
        }
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}
