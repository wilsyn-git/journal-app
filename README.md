# Journal.ai 📓

A focused, intelligent journaling application designed to help you de-clutter your mind and track your personal growth through daily reflection.

![Journal Dashboard](/public/dashboard-preview.png)
*(Note: You may want to add a screenshot here)*

## ✨ Key Features

### 🧠 Smart Dashboard
- **Dynamic Prompts**: Admin-configurable questions that can be Text, Checkboxes, or Radio buttons.
- **Timezone Aware**: "Today" is calculated based on *your* local time, ensuring your streaks are accurate no matter where you travel.
- **Daily Context**: Tracks your habits alongside your thoughts.

### 📊 Deep Analytics
- **Contribution Heatmap**: GitHub-style green square history tracking your consistency over the last year.
- **Word Cloud**: Visual representation of your most frequent themes.
- **Time of Day**: See if you are an "Early Bird" or a "Night Owl".
- **Gamification**: Unlock badges for consistency, word count, and timing.

### 🛠️ Admin & Configuration
- **User Management**: Admin role can view stats for other users (for coaching/accountability groups).
- **Prompt Rules**: Assign specific prompts to specific User Groups (e.g., "Athletes" get different questions than "Artists").
- **Profile Customization**: Users can upload avatars and manage their bio.

## 🏗️ Technology Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: SQLite (via Prisma ORM)
- **Styling**: TailwindCSS & Custom "Glassmorphism" Utilities
- **Auth**: NextAuth.js (Auth.js)

## 🚀 Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/journal-app.git
    cd journal-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Setup Database:**
    This project uses a local SQLite file. Initialize it with Prisma:
    ```bash
    npx prisma generate
    npx prisma db push
    # Optional: Seed initial data
    # npx prisma db seed
    ```

4.  **Run Development Server:**
    ```bash
    npm run dev
    ```

5.  **Open Browser:**
    Navigate to [http://localhost:3000](http://localhost:3000).

## 🗃️ Project Structure

- `app/`: Next.js App Router pages and layouts.
- `components/`: Reusable UI components (Heatmaps, PromptCards, etc.).
- `lib/`: Utilities for Database (`prisma.ts`), Analytics (`analytics.ts`), & Timezones (`timezone.ts`).
- `prisma/`: Database schema and migrations.

## 🛣️ Roadmap

- [ ] **AWS SES Integration**: For password resets and reminders.
- [ ] **Data Export**: Download your complete journal history.
- [ ] **Advanced Insights**: Sentiment analysis and mood tracking.

## 📄 License

MIT
