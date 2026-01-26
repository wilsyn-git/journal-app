# Deployment Guide: Journal App on AWS EC2 🚀

This guide steps through deploying the Journal App to an Ubuntu EC2 instance using **PM2**, **Nginx**, and **SQLite**.

## Prerequisites
-   AWS Account & EC2 Instance (Ubuntu 22.04 LTS or newer recommended).
-   Domain name pointing to your EC2 Public IP (A Record).
-   SSH Access to the server.

---

## 1. Server Setup
SSH into your instance:
```bash
ssh -i /path/to/key.pem ubuntu@your-server-ip
```

### Install Node.js & Tools
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ (via NVM recommended or Nodesource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx

# Install Process Manager (PM2)
sudo npm install -g pm2
```

## 2. Application Deployment

### Clone Repository
```bash
# Clone your repo (Use HTTPS or setup SSH keys on server)
git clone https://github.com/wilsyn-git/journal-app.git
cd journal-app

# Install dependencies
npm install
```

### Configure Environment
Create the production environment file:
```bash
cp .env.example .env.production
nano .env.production
```

**Critical Variables to Set:**
```ini
DATABASE_URL="file:./database.db"
AUTH_SECRET="<generate-a-long-random-string>" # openssl rand -base64 32
AUTH_URL="https://your-domain.com" # CRITICAL for production
NODE_ENV="production"

# AWS SES (If using email)
AWS_ACCESS_KEY_ID="<your-key>"
AWS_SECRET_ACCESS_KEY="<your-secret>"
AWS_REGION="us-east-1"
SOURCE_EMAIL="no-reply@your-domain.com"
```

## 3. Database Setup
Since we use SQLite, the database file will be created locally on the server.
```bash
# Generate Prisma Client
npx prisma generate

# Run Migrations (Creates database.db)
npx prisma migrate deploy

# Seed Initial Data (Admin User/Orgs)
npx prisma db seed
```

## 4. Build & Start

### Build Next.js
```bash
npm run build
```

### Start with PM2
```bash
# Start the app on port 3000
pm2 start npm --name "journal-app" -- start

# Save PM2 list to resurrect on reboot
pm2 save
pm2 startup
```

## 5. Reverse Proxy (Nginx)

Configure Nginx to forward traffic from Port 80 to Port 3000.

1.  Create config:
    ```bash
    sudo nano /etc/nginx/sites-available/journal-app
    ```

2.  Paste content:
    ```nginx
    server {
        server_name your-domain.com;

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  Enable Site:
    ```bash
    sudo ln -s /etc/nginx/sites-available/journal-app /etc/nginx/sites-enabled/
    sudo nginx -t # Test config
    sudo systemctl restart nginx
    ```

## 6. SSL Security (HTTPS)
Use Certbot to automatically fetch free Let's Encrypt certificates.
```bash
sudo certbot --nginx -d your-domain.com
```
Follow the prompts (Redirect HTTP to HTTPS: Yes).

---

## 7. Maintenance & Updates

### Updating the App
```bash
cd journal-app
git pull origin main
npm install
npx prisma migrate deploy
npm run build
pm2 restart journal-app
```

### Backing Up Data
Your data lives in `prisma/database.db` and binary uploads in `public/uploads`.
-   **Periodic Backup**: Copy `database.db` and `public/uploads` to an S3 bucket or download via SCP.
-   **Admin Tool**: Use the in-app "System Tools" to download a full JSON backup.
