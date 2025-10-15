const express = require("express")
const expressLayouts = require("express-ejs-layouts")
const mysql = require("mysql2")
const bodyParser = require("body-parser")
const path = require("path")
const multer = require("multer")
const xlsx = require("xlsx")
const session = require("express-session")
const bcrypt = require("bcrypt")

const app = express()
const PORT = process.env.PORT || 3000

// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "manager", // update if different
  database: "exam_seating_db",
})

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err)
    return
  }
  console.log("Connected to MySQL database")
})

// Middleware
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.set("view engine", "ejs")
app.use(expressLayouts)
app.set("layout", "layout")
app.set("views", path.join(__dirname, "views"))
app.use(express.static(path.join(__dirname, "public")))

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }, // 1 hour
  }),
)

app.use((req, res, next) => {
  res.locals.user = req.session.user || null
  next()
})

/* ========================
   Seating arrangement algo (robust CSP + greedy fallback)
   - Enforces no same-department adjacency (8 directions)
   - Interleaving helper used outside to distribute students across classrooms
========================= */
class SeatingAlgorithm {
  /**
   * students: array of { id?, roll_no?, name?, department }
   * rows, columns: integers
   * options: { adjacency: '8'|'4', maxTimeMs: number }
   */
  static generateSeatingArrangement(students, rows, columns, options = {}) {
    const adjacency = options.adjacency === "4" ? "4" : "8"
    const maxTimeMs = options.maxTimeMs ?? 3000

    const totalSeats = rows * columns
    const totalStudents = students.length
    if (totalStudents > totalSeats) {
      throw new Error("More students than seats for this classroom")
    }

    // group students by department and copy arrays so we can pop later
    const deptStudents = {}
    for (const s of students) {
      if (!deptStudents[s.department]) deptStudents[s.department] = []
      deptStudents[s.department].push(s)
    }
    const depts = Object.keys(deptStudents)
    const deptCounts = {}
    for (const d of depts) deptCounts[d] = deptStudents[d].length

    // Build seat order: parity-first then remaining (helps spread large depts)
    const seatOrder = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if ((r + c) % 2 === 0) seatOrder.push(r * columns + c)
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if ((r + c) % 2 === 1) seatOrder.push(r * columns + c)
      }
    }

    // neighbors for each absolute seat idx (r*cols + c)
    const deltas =
      adjacency === "4"
        ? [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]
        : [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [-1, 1],
            [1, -1],
            [1, 1],
          ]
    const neighbors = Array.from({ length: totalSeats }, () => [])
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const idx = r * columns + c
        for (const [dr, dc] of deltas) {
          const nr = r + dr,
            nc = c + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < columns) {
            neighbors[idx].push(nr * columns + nc)
          }
        }
      }
    }

    // assigned departments per seat (null or dept string)
    const assigned = Array(totalSeats).fill(null)
    const start = Date.now()

    const studentsLeft = (counts) => Object.values(counts).reduce((a, b) => a + b, 0)

    function backtrack(pos, counts, placedCount) {
      if (Date.now() - start > maxTimeMs) return false // timeout
      if (placedCount === totalStudents) return true
      if (pos >= seatOrder.length) return false

      const seatsRemaining = seatOrder.length - pos
      const toPlace = totalStudents - placedCount
      if (seatsRemaining < toPlace) return false

      const seatIdx = seatOrder[pos]

      // collect forbidden departments from neighbors already assigned
      const forbidden = new Set()
      for (const n of neighbors[seatIdx]) {
        const d = assigned[n]
        if (d) forbidden.add(d)
      }

      // order departments by remaining counts descending (heuristic)
      const choices = Object.keys(counts)
        .filter((d) => counts[d] > 0)
        .sort((a, b) => counts[b] - counts[a])

      for (const d of choices) {
        if (forbidden.has(d)) continue
        assigned[seatIdx] = d
        counts[d]--
        if (backtrack(pos + 1, counts, placedCount + 1)) return true
        // undo
        counts[d]++
        assigned[seatIdx] = null
      }

      // Option: skip this seat (leave empty) if still possible to place remaining students
      if (seatsRemaining - 1 >= toPlace) {
        if (backtrack(pos + 1, counts, placedCount)) return true
      }

      return false
    }

    // start backtracking
    const countsCopy = {}
    for (const d of depts) countsCopy[d] = deptCounts[d]

    const solved = backtrack(0, countsCopy, 0)

    // Greedy fallback if not solved (best-effort)
    if (!solved) {
      const countsGreedy = { ...deptCounts }
      for (const seatIdx of seatOrder) {
        if (studentsLeft(countsGreedy) === 0) break
        const forbidden = new Set()
        for (const n of neighbors[seatIdx]) {
          const d = assigned[n]
          if (d) forbidden.add(d)
        }
        const order = Object.keys(countsGreedy)
          .filter((d) => countsGreedy[d] > 0)
          .sort((a, b) => countsGreedy[b] - countsGreedy[a])
        let chosen = order.find((d) => !forbidden.has(d))
        if (!chosen) chosen = order[0]
        if (chosen) {
          assigned[seatIdx] = chosen
          countsGreedy[chosen]--
        }
      }
    }

    // map assigned departments back to actual student objects (FIFO per dept)
    const deptStacks = {}
    for (const d of Object.keys(deptStudents)) deptStacks[d] = [...deptStudents[d]]

    const seatingChart = Array.from({ length: rows }, () => Array(columns).fill(null))
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const idx = r * columns + c
        const d = assigned[idx]
        if (!d) {
          seatingChart[r][c] = null
        } else {
          seatingChart[r][c] = deptStacks[d].shift() || { department: d }
        }
      }
    }

    return seatingChart
  }
}

/* ========================
   Helper: interleave students by department
   (so classrooms get mixed departments instead of slices of DB-sorted students)
========================= */
function interleaveStudents(students) {
  // group by department
  const groups = {}
  for (const s of students) {
    if (!groups[s.department]) groups[s.department] = []
    groups[s.department].push(s)
  }
  const deptNames = Object.keys(groups)
  // get max size
  const maxSize = Math.max(...Object.values(groups).map((g) => g.length))
  const interleaved = []
  for (let i = 0; i < maxSize; i++) {
    for (const d of deptNames) {
      if (groups[d][i]) interleaved.push(groups[d][i])
    }
  }
  return interleaved
}

/* ========================
   Routes
========================= */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login")
  }
  next()
}

// Auth: Register
app.get("/register", (req, res) => {
  res.render("register", { error: null })
})

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body
  if (!name || !email || !password) {
    return res.render("register", { error: "All fields are required." })
  }
  try {
    const [existing] = await db.promise().query("SELECT id FROM users WHERE email = ?", [email])
    if (existing.length > 0) {
      return res.render("register", { error: "Email already registered. Please login." })
    }
    const hash = await bcrypt.hash(password, 10)
    await db.promise().query("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", [name, email, hash])
    res.redirect("/login")
  } catch (e) {
    console.error("Register error:", e)
    res.render("register", { error: "Registration failed. Please try again." })
  }
})

// Auth: Login
app.get("/login", (req, res) => {
  res.render("login", { error: null })
})

app.post("/login", async (req, res) => {
  const { email, password } = req.body
  try {
    const [rows] = await db.promise().query("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email])
    if (rows.length === 0) {
      return res.render("login", { error: "Invalid email or password." })
    }
    const user = rows[0]
    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.render("login", { error: "Invalid email or password." })
    }
    req.session.user = { id: user.id, name: user.name, email: user.email }
    res.redirect("/")
  } catch (e) {
    console.error("Login error:", e)
    res.render("login", { error: "Login failed. Please try again." })
  }
})

// Auth: Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login")
  })
})

// Public home stays public
app.get("/", (req, res) => {
  res.render("index")
})

// Students
app.get("/students", requireAuth, (req, res) => {
  db.query("SELECT * FROM students ORDER BY department, roll_no", (err, results) => {
    if (err) return res.status(500).send("Database error")
    res.render("students", { students: results })
  })
})

app.post("/add-student", requireAuth, (req, res) => {
  const { roll_no, name, department } = req.body
  db.query(
    "INSERT INTO students (roll_no, name, department) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), department = VALUES(department)",
    [roll_no, name, department],
    (err) => {
      if (err) return res.status(500).send("Error adding student")
      res.redirect("/students")
    },
  )
})

// Upload students via Excel (batch insert)
const upload = multer({ dest: "uploads/" }) // Declare the upload variable

app.post("/upload-students", requireAuth, upload.single("excelFile"), (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet)

    // Normalize headers (accept both lowercase and capitalized Excel headers)
    const values = rows.map((student) => [
      student.roll_no || student["Roll No"] || student["RollNo"] || student["roll_no"],
      student.name || student["Name"] || student["name"],
      student.department || student["Department"] || student["department"],
    ])

    if (values.length > 0) {
      const placeholders = values.map(() => "(?, ?, ?)").join(", ")
      const flatValues = values.flat()
      const query = `
        INSERT INTO students (roll_no, name, department)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE name = VALUES(name), department = VALUES(department)
      `
      db.query(query, flatValues, (err) => {
        if (err) {
          console.error(err)
          return res.status(500).send("Error uploading students")
        }
        res.redirect("/students")
      })
    } else {
      res.redirect("/students")
    }
  } catch (err) {
    console.error(err)
    res.status(500).send("Error uploading students")
  }
})

// Delete student
app.post("/delete-student/:id", requireAuth, (req, res) => {
  db.query("DELETE FROM students WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).send("Error deleting student")
    res.redirect("/students")
  })
})

// Classrooms
app.get("/classrooms", requireAuth, (req, res) => {
  db.query("SELECT * FROM classrooms", (err, results) => {
    if (err) return res.status(500).send("Database error")
    res.render("classrooms", { classrooms: results })
  })
})

app.post("/add-classroom", requireAuth, (req, res) => {
  const { name, rows, columns } = req.body
  db.query(
    "INSERT INTO classrooms (name, rows_count, cols_count) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rows_count = VALUES(rows_count), cols_count = VALUES(cols_count)",
    [name, rows, columns],
    (err) => {
      if (err) return res.status(500).send("Error adding classroom")
      res.redirect("/classrooms")
    },
  )
})

// Upload classrooms via Excel (batch insert)
app.post("/upload-classrooms", requireAuth, upload.single("excelFile"), (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = xlsx.utils.sheet_to_json(sheet)

    // Normalize headers
    const values = rows.map((room) => [
      room.name || room["Name"],
      room.rows_count || room["Rows"] || room["rows"],
      room.cols_count || room["Columns"] || room["cols"],
    ])

    if (values.length > 0) {
      const placeholders = values.map(() => "(?, ?, ?)").join(", ")
      const flatValues = values.flat()
      const query = `
        INSERT INTO classrooms (name, rows_count, cols_count)
        VALUES ${placeholders}
        ON DUPLICATE KEY UPDATE rows_count = VALUES(rows_count), cols_count = VALUES(cols_count)
      `
      db.query(query, flatValues, (err) => {
        if (err) {
          console.error(err)
          return res.status(500).send("Error uploading classrooms")
        }
        res.redirect("/classrooms")
      })
    } else {
      res.redirect("/classrooms")
    }
  } catch (err) {
    console.error(err)
    res.status(500).send("Error uploading classrooms")
  }
})

// Delete classroom
app.post("/delete-classroom/:id", requireAuth, (req, res) => {
  db.query("DELETE FROM classrooms WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).send("Error deleting classroom")
    res.redirect("/classrooms")
  })
})

// Seating arrangement form
app.get("/generate-seating", requireAuth, (req, res) => {
  const studentsQuery = "SELECT * FROM students ORDER BY department, roll_no"
  const classroomsQuery = "SELECT * FROM classrooms"

  db.query(studentsQuery, (err, students) => {
    if (err) return res.status(500).send("Database error")

    db.query(classroomsQuery, (err, classrooms) => {
      if (err) return res.status(500).send("Database error")
      res.render("generate-seating", {
        students,
        classrooms,
        pageCSS: "/css/generate.css",
      })
    })
  })
})

app.post("/generate-arrangement", requireAuth, (req, res) => {
  let classroomIds = []
  if (!req.body.classroom_ids) {
    return res.status(400).send("No classrooms selected")
  }
  classroomIds = Array.isArray(req.body.classroom_ids) ? req.body.classroom_ids : [req.body.classroom_ids]

  // Get selected classrooms
  db.query("SELECT * FROM classrooms WHERE id IN (?) ORDER BY id", [classroomIds], (err, classrooms) => {
    if (err || classrooms.length === 0) {
      return res.status(500).send("Classrooms not found")
    }

    // Get all students (we will interleave by department before assigning)
    db.query("SELECT * FROM students ORDER BY department, roll_no", (err, students) => {
      if (err) return res.status(500).send("Database error")

      // Interleave students by department to spread departments across classrooms
      const studentPool = interleaveStudents(students)

      const arrangements = []
      let studentIndex = 0

      classrooms.forEach((classroom) => {
        const totalSeats = classroom.rows_count * classroom.cols_count
        const classStudents = studentPool.slice(studentIndex, studentIndex + totalSeats)
        studentIndex += totalSeats

        // Use robust seating algorithm (maxTimeMs optional)
        let seatingChart = []
        try {
          seatingChart = SeatingAlgorithm.generateSeatingArrangement(
            classStudents,
            classroom.rows_count,
            classroom.cols_count,
            { adjacency: "8", maxTimeMs: 3000 },
          )
        } catch (e) {
          console.error("Seating generation error:", e)
          // fallback: simple fill left-to-right
          seatingChart = Array.from({ length: classroom.rows_count }, (_, r) =>
            Array.from({ length: classroom.cols_count }, (_, c) => {
              const idx = r * classroom.cols_count + c
              return classStudents[idx] || null
            }),
          )
        }

        const arrangementData = JSON.stringify({
          classroom,
          seating_chart: seatingChart,
          generated_at: new Date(),
        })

        arrangements.push({
          classroom,
          seatingChart,
          students: classStudents.length,
        })

        const userId = req.session.user?.id
        db.query(
          "INSERT INTO seating_arrangements (classroom_id, arrangement_data, user_id) VALUES (?, ?, ?)",
          [classroom.id, arrangementData, userId],
          (err) => {
            if (err) console.error("Insert error:", err)
          },
        )
      })

      // Render all classroom charts in one page
      res.render("seating-chart-multi", { arrangements })
    })
  })
})

app.get("/arrangements", requireAuth, (req, res) => {
  const query = `
    SELECT sa.*, c.name as classroom_name
    FROM seating_arrangements sa
    JOIN classrooms c ON sa.classroom_id = c.id
    WHERE sa.user_id = ?
    ORDER BY sa.created_at DESC
  `
  db.query(query, [req.session.user.id], (err, results) => {
    if (err) return res.status(500).send("Database error")
    res.render("arrangements", { arrangements: results })
  })
})

app.get("/view-arrangement/:id", requireAuth, (req, res) => {
  const arrangementId = req.params.id
  db.query("SELECT * FROM seating_arrangements WHERE id = ?", [arrangementId], (err, results) => {
    if (err || results.length === 0) {
      return res.status(404).send("Arrangement not found")
    }

    const arrangement = results[0]

    if (!arrangement.arrangement_data) {
      console.error(`Arrangement ${arrangementId} has empty data`)
      return res.status(500).send("Arrangement data missing. Please re-generate seating.")
    }

    let data
    try {
      let raw = arrangement.arrangement_data
      if (Buffer.isBuffer(raw)) raw = raw.toString("utf8")
      data = typeof raw === "string" ? JSON.parse(raw) : raw
    } catch (e) {
      console.error(`JSON parse error for arrangement ${arrangementId}:`, e.message)
      console.log("Raw data:", arrangement.arrangement_data)
      return res.status(500).send("Invalid arrangement data format. Please re-generate seating.")
    }

    if (!data.seating_chart) {
      return res.status(500).send("Arrangement data incomplete. Please re-generate seating.")
    }

    res.render("seating-chart", {
      classroom: data.classroom,
      seatingChart: data.seating_chart,
      students: data.seating_chart.flat().filter((s) => s !== null).length,
      isView: true,
    })
  })
})

// Delete all students
app.post("/delete-all-students", requireAuth, (req, res) => {
  const deleteStudentsQuery = "DELETE FROM students"
  db.query(deleteStudentsQuery, (err, result) => {
    if (err) {
      console.error("Error deleting students:", err)
      return res.status(500).send("Error deleting students")
    }
    res.redirect("/students")
  })
})

// Delete all classrooms
app.post("/delete-all-classrooms", requireAuth, (req, res) => {
  const deleteClassroomsQuery = "DELETE FROM classrooms"
  db.query(deleteClassroomsQuery, (err, result) => {
    if (err) {
      console.error("Error deleting classrooms:", err)
      return res.status(500).send("Error deleting classrooms")
    }
    res.redirect("/classrooms")
  })
})

/* ========================
   Start Server
========================= */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
