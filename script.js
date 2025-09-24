// Global variables
let html5QrcodeScanner;
let currentAdmin = '';
let studentsData = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadStoredData();
    checkLoginStatus();
});

// Authentication functions
function login() {
    const adminName = document.getElementById('adminName').value.trim();
    if (!adminName) {
        showNotification('Please enter your admin name', 'error');
        return;
    }

    currentAdmin = adminName;
    localStorage.setItem('currentAdmin', currentAdmin);

    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    document.getElementById('adminNameDisplay').textContent = `Admin: ${currentAdmin}`;

    initializeQRScanner();
    showNotification(`Welcome, ${currentAdmin}!`, 'success');
}

function logout() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    localStorage.removeItem('currentAdmin');
    currentAdmin = '';

    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('adminName').value = '';

    showNotification('Logged out successfully', 'info');
}

function checkLoginStatus() {
    const storedAdmin = localStorage.getItem('currentAdmin');
    if (storedAdmin) {
        currentAdmin = storedAdmin;
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('mainApp').classList.remove('hidden');
        document.getElementById('adminNameDisplay').textContent = `Admin: ${currentAdmin}`;
        initializeQRScanner();
    }
}

// QR Scanner functions
function initializeQRScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }

    html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader",
        {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0
        },
        false
    );

    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function onScanSuccess(decodedText, decodedResult) {
    console.log(`QR Code detected: ${decodedText}`);

    // Stop scanning temporarily
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause(true);
    }

    // Extract student ID from QR code
    const studentId = decodedText.trim();

    // Show scoring form
    document.getElementById('studentId').value = studentId;

    // Pre-fill student name if exists
    if (studentsData[studentId]) {
        document.getElementById('studentName').value = studentsData[studentId].name;
    } else {
        document.getElementById('studentName').value = '';
    }

    document.getElementById('scoreType').value = '';
    document.getElementById('score').value = '';
    document.getElementById('scoringForm').classList.remove('hidden');

    showNotification(`Student ID scanned: ${studentId}`, 'success');
}

function onScanFailure(error) {
    // Silently handle scan failures
    console.log(`QR Code scan error: ${error}`);
}

// Scoring functions
function submitScore() {
    const studentId = document.getElementById('studentId').value;
    const studentName = document.getElementById('studentName').value.trim();
    const scoreType = document.getElementById('scoreType').value;
    const score = parseFloat(document.getElementById('score').value);

    // Validation
    if (!studentName) {
        showNotification('Please enter student name', 'error');
        return;
    }

    if (!scoreType) {
        showNotification('Please select score type', 'error');
        return;
    }

    if (isNaN(score) || score < 0 || score > 100) {
        showNotification('Please enter a valid score (0-100)', 'error');
        return;
    }

    // Store score
    if (!studentsData[studentId]) {
        studentsData[studentId] = {
            name: studentName,
            scores: {},
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: currentAdmin
        };
    }

    studentsData[studentId].name = studentName;
    studentsData[studentId].scores[scoreType] = score;
    studentsData[studentId].lastUpdated = new Date().toISOString();
    studentsData[studentId].lastUpdatedBy = currentAdmin;

    // Save to localStorage
    saveData();

    // Show success message
    showNotification(`Score submitted: ${studentName} - ${scoreType}: ${score}`, 'success');

    // Reset form and resume scanning
    cancelScoring();
}

function cancelScoring() {
    document.getElementById('scoringForm').classList.add('hidden');

    // Clear form
    document.getElementById('studentId').value = '';
    document.getElementById('studentName').value = '';
    document.getElementById('scoreType').value = '';
    document.getElementById('score').value = '';

    // Resume scanning
    if (html5QrcodeScanner) {
        html5QrcodeScanner.resume();
    }
}

// Navigation functions
function showScanner() {
    document.getElementById('scannerSection').classList.remove('hidden');
    document.getElementById('dashboardSection').classList.add('hidden');

    // Reinitialize scanner if needed
    if (!html5QrcodeScanner) {
        initializeQRScanner();
    } else {
        html5QrcodeScanner.resume();
    }
}

function showDashboard() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause(true);
    }

    document.getElementById('scannerSection').classList.add('hidden');
    document.getElementById('dashboardSection').classList.remove('hidden');

    renderScoresTable();
}

// Dashboard functions
function renderScoresTable() {
    const tableContainer = document.getElementById('scoresTable');

    if (Object.keys(studentsData).length === 0) {
        tableContainer.innerHTML = '<p style="text-align: center; color: #666; font-style: italic;">No student scores recorded yet.</p>';
        return;
    }

    // Get all unique score types
    const scoreTypes = new Set();
    Object.values(studentsData).forEach(student => {
        Object.keys(student.scores).forEach(type => scoreTypes.add(type));
    });

    const scoreTypesArray = Array.from(scoreTypes).sort();

    // Create table HTML
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>Student ID</th>
                    <th>Student Name</th>
                    ${scoreTypesArray.map(type => `<th>${type}</th>`).join('')}
                    <th class="total-column">Total</th>
                    <th>Last Updated</th>
                    <th>Updated By</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Add student rows
    Object.entries(studentsData).forEach(([studentId, student]) => {
        let total = 0;
        const scoresCells = scoreTypesArray.map(type => {
            const score = student.scores[type];
            if (score !== undefined) {
                total += score;
                return `<td>${score}</td>`;
            }
            return '<td>-</td>';
        }).join('');

        const lastUpdated = new Date(student.lastUpdated).toLocaleString();

        tableHTML += `
            <tr>
                <td>${studentId}</td>
                <td><strong>${student.name}</strong></td>
                ${scoresCells}
                <td class="total-column"><strong>${total}</strong></td>
                <td>${lastUpdated}</td>
                <td>${student.lastUpdatedBy || 'Unknown'}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHTML;
}

// Excel export function
function exportToExcel() {
    if (Object.keys(studentsData).length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    // Get all unique score types
    const scoreTypes = new Set();
    Object.values(studentsData).forEach(student => {
        Object.keys(student.scores).forEach(type => scoreTypes.add(type));
    });

    const scoreTypesArray = Array.from(scoreTypes).sort();

    // Prepare data for Excel
    const excelData = [];

    // Header row
    const headers = ['Student ID', 'Student Name', ...scoreTypesArray, 'Total', 'Last Updated', 'Updated By'];
    excelData.push(headers);

    // Data rows
    Object.entries(studentsData).forEach(([studentId, student]) => {
        let total = 0;
        const row = [studentId, student.name];

        // Add score columns
        scoreTypesArray.forEach(type => {
            const score = student.scores[type];
            if (score !== undefined) {
                total += score;
                row.push(score);
            } else {
                row.push('');
            }
        });

        row.push(total);
        row.push(new Date(student.lastUpdated).toLocaleString());
        row.push(student.lastUpdatedBy || 'Unknown');

        excelData.push(row);
    });

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Student Scores");

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `student_scores_${timestamp}.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);

    showNotification('Excel file exported successfully!', 'success');
}

// Data management functions
function saveData() {
    localStorage.setItem('studentsData', JSON.stringify(studentsData));
}

function loadStoredData() {
    const stored = localStorage.getItem('studentsData');
    if (stored) {
        try {
            studentsData = JSON.parse(stored);
        } catch (error) {
            console.error('Error loading stored data:', error);
            studentsData = {};
        }
    }
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all student data? This action cannot be undone.')) {
        studentsData = {};
        localStorage.removeItem('studentsData');
        renderScoresTable();
        showNotification('All data cleared successfully', 'info');
    }
}

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.remove('hidden');

    setTimeout(() => {
        notification.classList.add('hidden');
    }, 4000);
}

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        // Page is hidden, pause scanner
        if (html5QrcodeScanner) {
            html5QrcodeScanner.pause(true);
        }
    } else {
        // Page is visible, resume scanner if on scanner section
        if (html5QrcodeScanner && !document.getElementById('scannerSection').classList.contains('hidden')) {
            html5QrcodeScanner.resume();
        }
    }
});

// Handle browser back/forward
window.addEventListener('beforeunload', function() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
    }
});