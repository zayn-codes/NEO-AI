# 🦉 NeoLit Assistant — AI-Powered Literacy & Language Platform

NeoLit Assistant is a premium, real-time AI-powered language learning and literacy application designed to provide customized curriculums and diagnostic placement tests tailored to each student. It uses Google Gemini 3.1 Flash-Lite to dynamically construct educational roadmaps and assess student proficiencies.

This project was built as an **internship assessment submission**.

---

## 🚀 Core Features

### 1. Tailored Diagnostic Onboarding Assessment
- **Real-Time Level Diagnostic**: A 15-question placement check generated dynamically using Gemini AI.
- **Educational Personalization**: The difficulty, paragraph complexity, and syntax of the questions dynamically match the student's completed **School Level** (e.g., *No Schooling / Primary Literacy*, *Primary*, *Middle*, *Secondary*, or *Higher College*).
- **Interactive Scorecard**: Results are graded on the server, assigning the student an initial proficiency level (Beginner, Intermediate, or Advanced).

### 2. Local Diagnostic Review Database
- **Local Cache Review**: Onboarding check databases (questions, selected answers, and correct answers) are stored in `localStorage`.
- **Scorecard Analysis**: A dedicated **Diagnostic Review** tab on the navigation bar allows users to inspect exactly which questions they answered correctly/incorrectly with distinct, clean visual feedback.

### 3. Dynamic Lazy Curriculum Roadmaps
- **Dynamic Content Generation**: Modules and roadmaps are generated using Gemini AI.
- **Dynamic Language Pairing Dropdowns**: Toggle both your **Instruction Language** (Speak: English, Hindi, Kannada, etc.) and your **Target Learning Language** (Learn: Spanish, German, French, etc.) dynamically on the dashboard header. Updating either pill will re-generate the custom curriculum roadmap in real-time.
- **Robust Exception Fallback**: Includes positional index fallbacks and default content schemas to guarantee a crash-free user experience if API call limits are reached.

### 4. Interactive Exercises & Vocal Speech Synthesis
- **Multiple Task Types**: Features read-aloud tasks, MCQs, and pictorial emoji recognition questions.
- **Vocal Pronunciation**: Uses browser-native `speechSynthesis` to speak target language words and phrases aloud.

---

## 🛠️ Technology Stack

*   **Backend**: FastAPI (Python), PostgreSQL (Database), Pydantic Settings, Uvicorn, asyncpg.
*   **AI Integration**: Google Gemini 3.1 Flash-Lite REST API.
*   **Frontend**: React.js (Vite), TypeScript, Tailwind CSS / Vanilla CSS framework, Lucide React icons.

---

## 📂 Project Architecture

```text
Neo AI/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── auth.py         # Registration, profile updates & delete account
│   │   │   ├── curriculum.py   # AI curriculum roadmap lazy populator
│   │   │   ├── assessment.py   # Dynamic diagnostic test generator
│   │   │   └── attempts.py     # Practice history recorders
│   │   ├── config.py           # Pydantic environment configurations
│   │   ├── db.py               # PostgreSQL connection pool manager
│   │   └── main.py             # FastAPI entrypoint and startup verification hook
│   ├── seed_db.py              # Pre-populates database tables
│   ├── reset_curriculum.py     # Database cleanup script
│   └── .env                    # System-wide configuration file (contains database DSN and Gemini key)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── LoginRegister.tsx           # Multi-step registration & onboarding
│   │   │   ├── Roadmap.tsx                 # Dashboard, curriculum tracks & native/target selects
│   │   │   ├── ProfileDashboard.tsx        # Profile settings & account deletion panel
│   │   │   └── DiagnosticReviewPanel.tsx   # Saved onboarding diagnostic review tab
│   │   ├── context/
│   │   │   └── AuthContext.tsx             # Authentication, themes & session context
│   │   ├── App.tsx                         # App layout switcher
│   │   └── main.tsx                        # React application main file
│   └── package.json
└── README.md
```

---

## ⚙️ Local Development Setup

### 1. Database Setup
Ensure you have a running PostgreSQL instance and create a database named `literacy_db` (or modify connection parameters in `.env`).

### 2. Backend Setup
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install required Python packages:
   ```bash
   pip install fastapi uvicorn pydantic-settings asyncpg python-dotenv
   ```
4. Create a `.env` file in the `backend/` directory:
   ```env
   DATABASE_URL=postgresql://<username>:<password>@localhost:5432/literacy_db
   SECRET_KEY=super-secret-neo-literacy-key-12345
   GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
   ```
5. Pre-seed the database:
   ```bash
   python seed_db.py
   ```
6. Start the API server:
   ```bash
   python -m uvicorn app.main:app --reload
   ```
   *Verify that you see `[INFO] Gemini API Key loaded successfully` in the console!*

### 3. Frontend Setup
1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Start the Vite React development server:
   ```bash
   npm run dev
   ```
4. Open your browser at `http://localhost:5173`.

---

## 📦 Pushing to GitHub (Step-by-Step)

To submit your internship project, follow these commands from the root directory (`Neo AI/`):

1. **Initialize the repository**:
   ```bash
   git init
   ```
2. **Add all files to staging** (respecting the root `.gitignore`):
   ```bash
   git add .
   ```
3. **Commit the changes**:
   ```bash
   git commit -m "feat: complete AI-powered literacy assistant internship submission"
   ```
4. **Link to your GitHub repository**:
   ```bash
   git branch -M main
   git remote add origin https://github.com/your-username/your-repo-name.git
   ```
5. **Push to GitHub**:
   ```bash
   git push -u origin main
   ```
