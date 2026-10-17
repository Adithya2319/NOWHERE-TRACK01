CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  category TEXT
);

CREATE TABLE IF NOT EXISTS timetable (
  id SERIAL PRIMARY KEY,
  day TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  subject TEXT NOT NULL,
  room TEXT,
  type TEXT
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  present INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deadlines (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT,
  type TEXT,
  priority TEXT,
  due_date DATE,
  status TEXT
);

CREATE TABLE IF NOT EXISTS rides (
  id SERIAL PRIMARY KEY,
  from_place TEXT NOT NULL,
  to_place TEXT NOT NULL,
  mode TEXT NOT NULL,
  seats INTEGER NOT NULL,
  fare TEXT,
  state TEXT,
  departure TEXT
);

CREATE TABLE IF NOT EXISTS leaderboard (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  points INTEGER NOT NULL,
  attendance INTEGER NOT NULL,
  rank INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS faculty (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  dept TEXT,
  subject TEXT,
  cabin TEXT,
  email TEXT,
  phone TEXT,
  office_hours TEXT
);

INSERT INTO subjects (name, credits, category) VALUES
('Applied Mathematics', 4, 'core'),
('Physics', 4, 'core'),
('Chemistry', 3, 'core'),
('Engineering Mechanics', 4, 'core'),
('Basic Electrical Engineering', 3, 'core'),
('C Programming', 3, 'core'),
('DBMS', 4, 'core'),
('Data Structures', 4, 'core'),
('Computer Networks', 3, 'elective'),
('Digital Logic', 3, 'elective');

INSERT INTO timetable (day, start_time, end_time, subject, room, type) VALUES
('Mon', '09:00', '10:30', 'Applied Mathematics', 'A-112', 'Lecture'),
('Mon', '11:00', '12:30', 'DBMS', 'LAB-3', 'Lab'),
('Tue', '08:00', '09:30', 'Physics', 'P-204', 'Lecture'),
('Tue', '13:00', '14:30', 'C Programming', 'CS-1', 'Tutorial'),
('Wed', '09:00', '10:30', 'Chemistry', 'C-201', 'Lecture'),
('Thu', '10:00', '11:30', 'Engineering Mechanics', 'M-102', 'Lecture'),
('Fri', '09:30', '11:00', 'DBMS', 'DB-3', 'Lecture'),
('Fri', '12:00', '13:00', 'Applied Mathematics', 'A-210', 'Tutorial'),
('Wed', '11:00', '12:30', 'Basic Electrical Engineering', 'EE-9', 'Lecture'),
('Thu', '14:00', '15:00', 'Data Structures', 'DS-4', 'Lab');

INSERT INTO attendance (student_id, subject, present, total) VALUES
('student-001', 'Applied Mathematics', 18, 22),
('student-001', 'Physics', 15, 20),
('student-001', 'Chemistry', 17, 18),
('student-001', 'DBMS', 17, 24),
('student-001', 'C Programming', 16, 20),
('student-001', 'Engineering Mechanics', 13, 19),
('student-001', 'Basic Electrical Engineering', 12, 18),
('student-001', 'Computer Networks', 14, 17),
('student-001', 'Digital Logic', 16, 19),
('student-001', 'Data Structures', 15, 18);

INSERT INTO deadlines (title, subject, type, priority, due_date, status) VALUES
('DBMS lab report', 'DBMS', 'Lab', 'High', '2026-10-16', 'Open'),
('Physics viva prep', 'Physics', 'Presentation', 'Medium', '2026-10-18', 'In Progress'),
('Applied Maths assignment', 'Applied Mathematics', 'Assignment', 'High', '2026-10-20', 'Open'),
('Chemistry practical journal', 'Chemistry', 'Practical', 'Low', '2026-10-25', 'Open'),
('C Programming mini project', 'C Programming', 'Project', 'High', '2026-10-22', 'In Progress'),
('Data Structures quiz prep', 'Data Structures', 'Quiz', 'Medium', '2026-10-24', 'Open'),
('Analog electronics sheet', 'Digital Logic', 'Assignment', 'Low', '2026-10-31', 'Open'),
('Circuit simulation lab', 'Basic Electrical Engineering', 'Lab', 'High', '2026-10-29', 'Open'),
('Physica notes review', 'Physics', 'Study', 'Medium', '2026-11-03', 'Open'),
('Innovation challenge submission', 'Engineering Mechanics', 'Project', 'High', '2026-11-05', 'Open');

INSERT INTO rides (from_place, to_place, mode, seats, fare, state, departure) VALUES
('VJTI Gate', 'Fr. CRCE', 'Car', 2, '₹80/seat', 'Available', '18:15'),
('Powai Lake', 'Mumbai University', 'Bike', 1, '₹60', 'Requested', '08:10'),
('Andheri Station', 'Campus', 'Auto', 3, 'As per meter', 'Confirmed', '07:50'),
('Kanjurmarg', 'Hostel', 'Car', 2, '₹95/seat', 'Available', '17:45'),
('Dadar', 'Campus', 'Bike', 1, '₹55', 'Available', '07:30'),
('Chembur', 'Library', 'Auto', 2, 'As per meter', 'Available', '17:10'),
('Seawoods', 'Campus', 'Car', 2, '₹90/seat', 'Requested', '18:00'),
('Bandra', 'Campus', 'Bike', 1, '₹70', 'Confirmed', '08:00'),
('Kurla', 'Hostel', 'Auto', 4, 'As per meter', 'Available', '19:00'),
('Mira Road', 'Campus', 'Car', 3, '₹110/seat', 'Available', '18:45');

INSERT INTO leaderboard (name, points, attendance, rank) VALUES
('Aarav', 820, 89, 1),
('Sana', 790, 88, 2),
('Ritesh', 740, 82, 3),
('Kavya', 720, 85, 4),
('Vikram', 680, 79, 5),
('Pooja', 640, 81, 6),
('Aditya', 620, 78, 7),
('Neha', 610, 75, 8),
('Ishaan', 590, 74, 9),
('Mitali', 560, 71, 10);

INSERT INTO faculty (name, dept, subject, cabin, email, phone, office_hours) VALUES
('Dr. Priya Nair', 'Mathematics', 'Applied Mathematics', 'A-204', 'priya.nair@mu.ac.in', '+91 2222 1122', 'Mon-Fri 10:30-12:00'),
('Prof. Ankit Rao', 'DBMS', 'DBMS', 'CS-14', 'ankit.rao@mu.ac.in', '+91 2222 3344', 'Tue-Thu 13:00-14:30'),
('Dr. Swati Kulkarni', 'Physics', 'Physics', 'P-307', 'swati.kulkarni@mu.ac.in', '+91 2222 5566', 'Mon-Wed 11:00-12:30'),
('Prof. Harshad Bhosale', 'Programming', 'C Programming', 'CS-09', 'harshad.bhosale@mu.ac.in', '+91 2222 8899', 'Thu-Fri 12:30-14:00'),
('Dr. Meera Shah', 'Chemistry', 'Chemistry', 'C-201', 'meera.shah@mu.ac.in', '+91 2222 4422', 'Tue-Fri 09:00-10:30'),
('Dr. Sandeep Gawde', 'Mechanics', 'Engineering Mechanics', 'M-003', 'sandeep.gawde@mu.ac.in', '+91 2222 6677', 'Mon-Thu 12:00-13:30'),
('Prof. Nisha Dutta', 'Electrical', 'Basic Electrical Engineering', 'EE-25', 'nisha.dutta@mu.ac.in', '+91 2222 7788', 'Mon-Wed 14:00-15:30'),
('Prof. Karan Mehta', 'Computer Science', 'Data Structures', 'CS-22', 'karan.mehta@mu.ac.in', '+91 2222 9911', 'Mon-Fri 15:00-16:00'),
('Dr. Avinash Patil', 'Networking', 'Computer Networks', 'NET-8', 'avinash.patil@mu.ac.in', '+91 2222 2211', 'Wed-Fri 11:30-13:00'),
('Mrs. Sheetal Bane', 'Digital Systems', 'Digital Logic', 'DIG-4', 'sheetal.bane@mu.ac.in', '+91 2222 3355', 'Tue-Fri 10:00-11:00');
