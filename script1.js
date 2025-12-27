// ============================================
// GLOBAL STATE
// ============================================

/**
 * Store all transactions fetched from Firebase
 */
let transactions = [];

/**
 * Store filtered transactions (after applying filters)
 */
let filteredTransactions = [];

/**
 * Pie chart instance (to update/destroy)
 */
let categoryChart = null;

// ============================================
// DOM REFERENCES (Cache for performance)
// ============================================
const db = window.db;
const transactionForm = document.getElementById("transactionForm");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const typeInput = document.getElementById("type");
const dateInput = document.getElementById("date");
const descriptionInput = document.getElementById("description");
const transactionTable = document.getElementById("transactionTable");
const noTransactions = document.getElementById("noTransactions");
const totalIncomeEl = document.getElementById("totalIncome");
const totalExpenseEl = document.getElementById("totalExpense");
const balanceEl = document.getElementById("balance");
const filterCategory = document.getElementById("filterCategory");
const categoryChartCanvas = document.getElementById("categoryChart");
const noChartData = document.getElementById("noChartData");

// ============================================
// PAGE LOAD & EVENT SETUP
// ============================================

/**
 * DOMContentLoaded: Fires when HTML is fully parsed
 * Set up initial state and event listeners
 */
window.addEventListener("DOMContentLoaded", () => {
  // Set today's date as default
  const today = new Date().toISOString().split("T")[0];
  dateInput.value = today;

  // Load existing transactions from Firebase
  loadTransactions();

  // Form submission listener
  transactionForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // Don't reload page
    await addTransaction();
  });

  // Filter dropdown listener
  filterCategory.addEventListener("change", () => {
    filterTransactions();
  });

  // Real-time sync: Auto-reload when Firestore changes
  window.onSnapshot(window.collection(window.db, "transactions"), (snapshot) => {
    console.log("✅ Firestore update detected, syncing...");
    loadTransactions();
  });
});

// ============================================
// FORM VALIDATION
// ============================================

/**
 * Validate form inputs before submission
 * @returns {boolean} true if valid, false otherwise
 */
function validateForm() {
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value.trim();
  const date = dateInput.value;
  const description = descriptionInput.value.trim();

  const errors = [];

  // Check description
  if (!description) {
    errors.push("❌ Description is required");
  } else if (description.length < 3) {
    errors.push("❌ Description must be at least 3 characters");
  }

  // Check amount
  if (!amount || isNaN(amount)) {
    errors.push("❌ Amount must be a valid number");
  } else if (amount <= 0) {
    errors.push("❌ Amount must be greater than ₹0");
  }

  // Check category
  if (!category) {
    errors.push("❌ Please select a category");
  }

  // Check date
  if (!date) {
    errors.push("❌ Please select a date");
  } else {
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to midnight
    if (selectedDate > today) {
      errors.push("❌ Date cannot be in the future");
    }
  }

  // Show all errors if any
  if (errors.length > 0) {
    alert("⚠️ VALIDATION ERRORS:\n\n" + errors.join("\n"));
    return false;
  }

  return true;
}

// ============================================
// ADD TRANSACTION
// ============================================

/**
 * Add a new transaction to Firestore
 */
async function addTransaction() {
  // Step 1: Validate
  if (!validateForm()) {
    return;
  }

  // Step 2: Extract values
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;
  const type = typeInput.value;
  const date = dateInput.value;
  const description = descriptionInput.value.trim();

  try {
    // Step 3: Create object
    const newTransaction = {
      amount: amount,
      category: category,
      type: type,
      date: date,
      description: description,
      createdAt: new Date().toISOString()
    };

    // Step 4: Add to Firestore
    const docRef = await window.addDoc(
      window.collection(window.db, "transactions"),
      newTransaction
    );

    console.log("✅ Transaction added with ID:", docRef.id);

    // Step 5: Reset form
    transactionForm.reset();
    const today = new Date().toISOString().split("T")[0];
    dateInput.value = today;

    // Show success message
    alert("✅ Transaction added successfully!");

    // Step 6: Reload (onSnapshot will also trigger)
    await loadTransactions();

  } catch (error) {
    console.error("❌ Error adding transaction:", error);
    alert(`❌ Error: ${error.message}\n\nCheck console (F12) for details.`);
  }
}

// ============================================
// LOAD TRANSACTIONS
// ============================================

/**
 * Fetch all transactions from Firestore
 */
async function loadTransactions() {
  try {
    // Fetch all documents
    const querySnapshot = await window.getDocs(
      window.collection(window.db, "transactions")
    );

    // Clear old data
    transactions = [];

    // Add each document to array
    querySnapshot.forEach((document) => {
      transactions.push({
        id: document.id,      // Document ID
        ...document.data()    // All fields from document
      });
    });

    console.log(`✅ Loaded ${transactions.length} transactions`);

    // Sort by date (newest first)
    transactions.sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    });

    // Reset filter and refresh UI
    filterCategory.value = "";
    filterTransactions();

  } catch (error) {
    console.error("❌ Error loading transactions:", error);
    alert("Error loading transactions from database");
  }
}

// ============================================
// FILTER TRANSACTIONS
// ============================================

/**
 * Filter transactions by category
 */
function filterTransactions() {
  const selectedCategory = filterCategory.value;

  // If no filter, show all
  if (selectedCategory === "") {
    filteredTransactions = [...transactions]; // Copy array
  } else {
    // Filter by category
    filteredTransactions = transactions.filter(t => t.category === selectedCategory);
  }

  console.log(`Filtered to ${filteredTransactions.length} transactions`);

  // Update display
  displayTransactions();
  updateSummary();
  updateChart();
}

// ============================================
// DISPLAY TRANSACTIONS
// ============================================

/**
 * Render transactions in HTML table
 */
function displayTransactions() {
  // Clear old rows
  transactionTable.innerHTML = "";

  // If no data
  if (filteredTransactions.length === 0) {
    noTransactions.style.display = "block";
    return;
  }

  noTransactions.style.display = "none";

  // Create row for each transaction
  filteredTransactions.forEach((transaction) => {
    const row = document.createElement("tr");
    row.className = "border-b border-gray-200 hover:bg-blue-50 transition-colors";

    // Format date: "2025-12-26" → "26 Dec 2025"
    const dateObj = new Date(transaction.date + "T00:00:00");
    const formattedDate = dateObj.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    // Choose color and sign
    const isIncome = transaction.type === "income";
    const amountClass = isIncome ? "text-green-600" : "text-red-600";
    const amountSign = isIncome ? "+" : "-";

    // Build row HTML
    row.innerHTML = `
      <td class="px-6 py-4 font-medium">${formattedDate}</td>
      <td class="px-6 py-4">${transaction.description}</td>
      <td class="px-6 py-4">
        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
          ${transaction.category}
        </span>
      </td>
      <td class="px-6 py-4">
        <span class="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm font-medium">
          ${isIncome ? "Income 📈" : "Expense 📉"}
        </span>
      </td>
      <td class="px-6 py-4 text-right font-bold ${amountClass}">
        ${amountSign}₹${transaction.amount.toFixed(2)}
      </td>
      <td class="px-6 py-4 text-center">
        <button
          onclick="deleteTransaction('${transaction.id}')"
          class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors"
        >
          🗑️ Delete
        </button>
      </td>
    `;

    transactionTable.appendChild(row);
  });
}

// ============================================
// DELETE TRANSACTION
// ============================================

/**
 * Delete a transaction from Firestore
 * @param {string} transactionId - Document ID
 */
async function deleteTransaction(transactionId) {
  // Confirm before deleting
  if (!confirm("Are you sure you want to delete this transaction?")) {
    return;
  }

  try {
    // Delete from Firestore
    await window.deleteDoc(window.doc(window.db, "transactions", transactionId));

    console.log("✅ Transaction deleted:", transactionId);
    alert("✅ Transaction deleted successfully!");

    // Reload
    await loadTransactions();

  } catch (error) {
    console.error("❌ Error deleting transaction:", error);
    alert("Error deleting transaction");
  }
}

// ============================================
// UPDATE SUMMARY CARDS
// ============================================

/**
 * Calculate and display income, expense, balance
 */
function updateSummary() {
  let totalIncome = 0;
  let totalExpense = 0;

  // Sum up income and expenses
  filteredTransactions.forEach((transaction) => {
    if (transaction.type === "income") {
      totalIncome += transaction.amount;
    } else {
      totalExpense += transaction.amount;
    }
  });

  // Calculate balance
  const balance = totalIncome - totalExpense;

  // Update HTML
  totalIncomeEl.textContent = `₹${totalIncome.toFixed(2)}`;
  totalExpenseEl.textContent = `₹${totalExpense.toFixed(2)}`;
  balanceEl.textContent = `₹${balance.toFixed(2)}`;

  // Change color based on balance
  if (balance >= 0) {
    balanceEl.className = "text-4xl font-bold text-green-600"; // Green
  } else {
    balanceEl.className = "text-4xl font-bold text-red-600"; // Red
  }
}

// ============================================
// UPDATE CHART
// ============================================

/**
 * Draw/update pie chart of expenses by category
 */
function updateChart() {
  // Step 1: Calculate spending by category
  const categorySpending = {}; // { Food: 500, Transport: 200, ... }

  filteredTransactions.forEach((transaction) => {
    // Only count expenses
    if (transaction.type === "expense") {
      if (!categorySpending[transaction.category]) {
        categorySpending[transaction.category] = 0;
      }
      categorySpending[transaction.category] += transaction.amount;
    }
  });

  // Step 2: Extract labels and data
  const labels = Object.keys(categorySpending);      // ["Food", "Transport", ...]
  const data = Object.values(categorySpending);      // [500, 200, ...]

  // If no expenses
  if (labels.length === 0) {
    const ctx = categoryChartCanvas.getContext("2d");
    ctx.clearRect(0, 0, categoryChartCanvas.width, categoryChartCanvas.height);
    if (categoryChart) categoryChart.destroy();
    noChartData.style.display = "block";
    return;
  }

  noChartData.style.display = "none";

  // Step 3: Destroy old chart
  if (categoryChart) {
    categoryChart.destroy();
  }

  // Step 4: Create new chart
  const ctx = categoryChartCanvas.getContext("2d");
  categoryChart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [{
        label: "Amount (₹)",
        data: data,
        backgroundColor: [
          "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0",
          "#9966FF", "#FF9F40", "#FF6384", "#C9CBCF"
        ],
        borderColor: "#fff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 15,
            font: { size: 12 }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.label + ": ₹" + context.parsed.y.toFixed(2);
            }
          }
        }
      }
    }
  });
}

// ============================================
// EXPORT TO CSV
// ============================================

/**
 * Download all transactions as CSV file
 */
function exportToCSV() {
  // Check if data exists
  if (transactions.length === 0) {
    alert("No transactions to export!");
    return;
  }

  // Step 1: Create CSV header
  let csvContent = "Date,Description,Category,Type,Amount\n";

  // Step 2: Add each transaction row
  transactions.forEach((transaction) => {
    const dateObj = new Date(transaction.date + "T00:00:00");
    const formattedDate = dateObj.toLocaleDateString("en-IN");
    
    const row = [
      formattedDate,
      transaction.description,
      transaction.category,
      transaction.type,
      transaction.amount.toFixed(2)
    ];

    csvContent += row.join(",") + "\n";
  });

  // Step 3: Create file
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  // Step 4: Create download link
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", "expense-tracker.csv");
  link.style.visibility = "hidden";

  // Step 5: Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  alert("✅ CSV exported successfully! Check Downloads folder.");
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format number as currency
 */
function formatCurrency(amount) {
  return "₹" + amount.toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

/**
 * Format date string
 */
function formatDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

function testFirestore() {
    alert("Firestore button clicked!");
}

}
