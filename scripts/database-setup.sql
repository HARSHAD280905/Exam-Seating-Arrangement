-- Create database and tables for the exam seating system
CREATE DATABASE IF NOT EXISTS exam_seating_db;
USE exam_seating_db;

-- Students table
CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    roll_no VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    rows INT NOT NULL,
    columns INT NOT NULL,
    capacity INT GENERATED ALWAYS AS (rows * columns) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seating arrangements table
CREATE TABLE IF NOT EXISTS seating_arrangements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    classroom_id INT,
    arrangement_data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
);

-- Insert sample data
INSERT INTO students (roll_no, name, department) VALUES
('CSE01', 'John Doe', 'CSE'),
('CSE02', 'Jane Smith', 'CSE'),
('CSE03', 'Mike Johnson', 'CSE'),
('CSE04', 'Sarah Wilson', 'CSE'),
('CSE05', 'David Brown', 'CSE'),
('ECE01', 'Alice Davis', 'ECE'),
('ECE02', 'Bob Miller', 'ECE'),
('ECE03', 'Carol Garcia', 'ECE'),
('ECE04', 'Daniel Rodriguez', 'ECE'),
('ECE05', 'Eva Martinez', 'ECE'),
('ME01', 'Frank Anderson', 'MECH'),
('ME02', 'Grace Taylor', 'MECH'),
('ME03', 'Henry Thomas', 'MECH'),
('ME04', 'Ivy Jackson', 'MECH');

INSERT INTO classrooms (name, rows, columns) VALUES
('Room A-101', 5, 6),
('Room A-102', 4, 8),
('Room B-201', 6, 5);
