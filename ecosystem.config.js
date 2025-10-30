module.exports = {
  apps: [
    {
      name: "homelife-backend",
      script: "./backend/server.js",
      instances: 1, 
      exec_mode: "fork",
      env: {
        NODE_ENV: "development",
        PORT: 8001,
        MONGO_URI:
          "mongodb+srv://sri:Bestway2025@homelife.qqqjxz.mongodb.net/homelife?retryWrites=true&w=majority&appName=Homelife",
        DOMAIN: "localhost:8001",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 8001,
        MONGO_URI:
          "mongodb+srv://sri:Bestway2025@homelife.qqqjxz.mongodb.net/homelife?retryWrites=true&w=majority&appName=Homelife",
        DOMAIN: "homelife.brokeragelead.ca",
        JWT_SECRET: "ade87249cbffe4b686d3813db4639185d85862c560d9c12cbde8a6d31ba954ea052dc724a355c79bb3981032d895fdfe437ab1589e0ba4774e624c53cbd2743a",
        EMAIL_SERVICE: "mailwire",
        EMAIL_HOST: "cloud1.mailwire.com",
        EMAIL_PORT: 465,
        EMAIL_SECURE: true,
        EMAIL_USER: "admin@brokercore.co",
        EMAIL_PASSWORD: "Toronto9889&",
        DROPBOX_APP_KEY: "5y0cw6jomnp7s7k",
        DROPBOX_APP_SECRET: "je3j0rix9rx9bzs",
        FRONTEND_URL: "http://homelife.brokeragelead.ca",
        FRONTEND_URL_LOCAL: "http://localhost:3000",
        FRONTEND_URL_IP: "http://107.161.34.44:8001",
      },
      error_file: "./logs/backend-err.log",
      out_file: "./logs/backend-out.log",
      log_file: "./logs/backend-combined.log",
      time: true,
      max_memory_restart: "1G",
      node_args: "--max_old_space_size=4096",
      watch: false,
      ignore_watch: ["node_modules", "logs", "frontend/node_modules"],
    },
  ],

  deploy: {
    production: {
      user: "windows", // change to your server username
      host: ["107.161.34.44"], // change to your server IP
      ref: "origin/main", // or your main branch
      repo: "git@github.com:yourusername/homelife-top-star-realty.git", // change to your repo
      path: "/var/www/homelife-top-star-realty",
      "pre-deploy-local": "",
      "post-deploy":
        "npm run build && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "",
      ssh_options: "StrictHostKeyChecking=no",
    },
  },
};
