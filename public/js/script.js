// Toggle form visibility
function toggleAddForm() {
  const form = document.getElementById("addStudentForm") || document.getElementById("addClassroomForm")
  if (form) {
    form.style.display = form.style.display === "none" ? "block" : "none"
  }
}

// Print seating chart
function printChart() {
  window.print()
}

// Form validation
document.addEventListener("DOMContentLoaded", () => {
  // Add form validation
  const forms = document.querySelectorAll("form")
  forms.forEach((form) => {
    form.addEventListener("submit", (e) => {
      const requiredFields = form.querySelectorAll("[required]")
      let isValid = true

      requiredFields.forEach((field) => {
        if (!field.value.trim()) {
          isValid = false
          field.style.borderColor = "#dc3545"
        } else {
          field.style.borderColor = "#28a745"
        }
      })

      if (!isValid) {
        e.preventDefault()
        alert("Please fill in all required fields.")
      }
    })
  })

  // Real-time capacity calculation
  const rowsInput = document.getElementById("rows")
  const columnsInput = document.getElementById("columns")

  if (rowsInput && columnsInput) {
    function updateCapacity() {
      const rows = Number.parseInt(rowsInput.value) || 0
      const columns = Number.parseInt(columnsInput.value) || 0
      const capacity = rows * columns

      // Show capacity preview
      let capacityDisplay = document.getElementById("capacity-display")
      if (!capacityDisplay) {
        capacityDisplay = document.createElement("div")
        capacityDisplay.id = "capacity-display"
        capacityDisplay.style.marginTop = "0.5rem"
        capacityDisplay.style.fontWeight = "bold"
        capacityDisplay.style.color = "#007bff"
        columnsInput.parentNode.appendChild(capacityDisplay)
      }

      capacityDisplay.textContent = `Total Capacity: ${capacity} seats`
    }

    rowsInput.addEventListener("input", updateCapacity)
    columnsInput.addEventListener("input", updateCapacity)
  }

  // Smooth scrolling for navigation
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault()
      const target = document.querySelector(this.getAttribute("href"))
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
        })
      }
    })
  })

  // Add loading state to generate button
  const generateForm = document.querySelector('form[action="/generate-arrangement"]')
  if (generateForm) {
    generateForm.addEventListener("submit", function () {
      const submitBtn = this.querySelector('button[type="submit"]')
      if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...'
        submitBtn.disabled = true
      }
    })
  }
})

// Seating chart interactions
document.addEventListener("DOMContentLoaded", () => {
  const seats = document.querySelectorAll(".seat.occupied")

  seats.forEach((seat) => {
    seat.addEventListener("mouseenter", function () {
      this.style.transform = "scale(1.05)"
      this.style.zIndex = "10"
      this.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)"
    })

    seat.addEventListener("mouseleave", function () {
      this.style.transform = "scale(1)"
      this.style.zIndex = "1"
      this.style.boxShadow = "none"
    })
  })
})

// Export functionality (placeholder for future implementation)
function exportToPDF() {
  // This would integrate with a PDF library like jsPDF
  alert("PDF export functionality would be implemented here")
}

function exportToExcel() {
  // This would integrate with an Excel export library
  alert("Excel export functionality would be implemented here")
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl+P for print
  if (e.ctrlKey && e.key === "p") {
    e.preventDefault()
    printChart()
  }

  // Escape to close forms
  if (e.key === "Escape") {
    const forms = document.querySelectorAll("#addStudentForm, #addClassroomForm")
    forms.forEach((form) => {
      if (form.style.display !== "none") {
        form.style.display = "none"
      }
    })
  }
})
