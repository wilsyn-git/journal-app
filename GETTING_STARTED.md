# Getting Started with Your Journal

Welcome to your new journaling platform! This guide will walk you through setting up a "Company Journal" instance from scratch, explaining the core concepts along the way.

## 1. Installation & Admin Setup

Once you have the application running (via `pm2 start` or `npm run start`), the first step is to secure your instance.

### Create the First Admin
(In a future update, we will provide a setup script. for now, we use the seeded `admin@example.com` / `password123` account, which you should change immediately.)

## 2. Branding Your Identity 🎨

Log in as the Admin and navigate to **Branding** in the sidebar.

*   **Site Name**: Change "myJournal" to **"Company Journal"**.
*   **Logo**: Upload your company logo. This replaces the default icon in the top-left and on the login screen.

> **Why?** Custom branding helps users feel like they are in a trusted, internal space rather than a generic tool.

## 3. Structuring Your Organization 🏗️

The power of this platform lies in its segmentation. You don't just dump everyone into one bucket; you tailor the experience.

### The Hierarchy
*   **Users**: The people logging in.
*   **Groups**: "Who are they?" (e.g., *New Hires*, *Regular Staff*, *Managers*).
*   **Prompts**: "What do we ask?" (The actual questions).
*   **Profiles**: "The Connection". A Profile is a collection of Prompts assigned to a Group.

---

### Step-by-Step Setup: The "Company Journal" Scenario

Imagine we want to track the well-being of both **New Hires** and **Regular Staff**.

#### A. Define Groups
Go to the **Groups** panel and create two groups:
1.  **"New Hires"**: For employees in their first 90 days.
2.  **"Regular Users"**: For everyone else.

#### B. Create Prompts (The Questions)
Go to **Prompts**. You can create prompts manually or import a JSON file.

**Understanding Prompt Types:**
*   **Radio**: Multiple choice, single answer. *Best for: Analytics (Yes/No), quick pulse checks.*
*   **Checkbox**: Multiple choice, multiple answers. *Best for: Habit tracking, daily tasks.*
*   **Text**: Open-ended. *Best for: Deep reflection, qualitative feedback.*

**Example JSON Import:**
Copy and paste this into the "Import" tool to jumpstart your database:

```json
[
  {
    "category": "Daily Tasks",
    "text": "Did you update your Jira tickets?",
    "type": "radio",
    "options": ["Yes", "No", "Not Applicable"]
  },
  {
    "category": "Daily Tasks",
    "text": "Did you log your work hours?",
    "type": "radio",
    "options": ["Yes", "No"]
  },
  {
    "category": "Wellness",
    "text": "How many glasses of water did you drink?",
    "type": "radio",
    "options": ["0-2", "3-5", "6+"]
  },
  {
    "category": "New Hire Check-in",
    "text": "Did you meet with your mentor today?",
    "type": "radio",
    "options": ["Yes", "No", "Scheduled for later"]
  },
  {
    "category": "Reflection",
    "text": "What is one thing you learned today?",
    "type": "text"
  }
]
```

#### C. Build Profiles
Now we bundle these prompts into experiences. Go to **Profiles**.

1.  **Create "Standard Profile"**:
    *   *Assign to Group*: "Regular Users"
    *   *Select Prompts*: Checking "Daily Tasks" (Jira, Hours) and "Wellness" (Water).
    *   *Result*: Regular staff will only see these operational questions.

2.  **Create "New Hire Profile"**:
    *   *Assign to Group*: "New Hires"
    *   *Select Prompts*: Check "Daily Tasks" AND "New Hire Check-in" AND "Reflection".
    *   *Result*: New Hires get the standard operational questions PLUS the mentorship check-in and learning reflection.

## 4. Onboarding Users 👥

Now that the structure is ready, bring people in.

Go to **Users** -> **Create User**.

*   **Create "Alice"** (The Veteran):
    *   Email: `alice@company.com`
    *   Group: Select "Regular Users".
    *   *Outcome*: When Alice logs in, she sees the "Standard Profile".

*   **Create "Bob"** (The Rookie):
    *   Email: `bob@company.com`
    *   Group: Select "New Hires".
    *   *Outcome*: When Bob logs in, he sees the "New Hire Profile".

## 5. The User Experience 🚀

*   **Daily Routine**: Users log in and are presented with *Today's* journal entry.
*   **History**: They can browse past months to see their growth and consistency.
*   **Stats**: They get a personal dashboard (Heatmap, Word Cloud) to visualize their habits.

---
**Next Steps:**
Once you're comfortable, check out the `README.md` for advanced features like Data Export and Activity Tracking!
